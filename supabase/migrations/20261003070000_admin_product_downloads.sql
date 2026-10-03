BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE FUNCTION public.set_product_download(
  p_admin_id uuid, p_product_id bigint, p_expected_path text,
  p_file_path text, p_file_name text, p_enabled boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous public.product_downloads%ROWTYPE; next_path text; next_name text;
BEGIN
  PERFORM 1 FROM public.admin_users WHERE user_id=p_admin_id FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','not_admin'); END IF;
  IF p_product_id IS NULL OR p_product_id<=0 OR p_enabled IS NULL THEN
    RETURN jsonb_build_object('ok',false,'code','invalid_request');
  END IF;
  PERFORM 1 FROM public.products WHERE id=p_product_id FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','missing_product'); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-download:'||p_product_id::text,0));
  SELECT * INTO previous FROM public.product_downloads WHERE product_id=p_product_id FOR UPDATE;
  IF previous.file_path IS DISTINCT FROM p_expected_path THEN
    RETURN jsonb_build_object('ok',false,'code','download_changed');
  END IF;
  IF p_file_path IS NULL THEN
    IF previous.file_path IS NULL THEN RETURN jsonb_build_object('ok',false,'code','missing_file'); END IF;
    next_path:=previous.file_path; next_name:=previous.file_name;
  ELSE
    IF p_file_name IS NULL OR p_file_name !~ '^[A-Za-z0-9][A-Za-z0-9._-]*\.[zZ][iI][pP]$'
       OR length(p_file_name)>128
       OR p_file_path !~ ('^'||p_product_id::text||'/[0-9a-f-]{36}/')
       OR p_file_path <> split_part(p_file_path,'/',1)||'/'||split_part(p_file_path,'/',2)||'/'||p_file_name THEN
      RETURN jsonb_build_object('ok',false,'code','invalid_request');
    END IF;
    next_path:=p_file_path; next_name:=p_file_name;
  END IF;
  IF p_enabled AND (
    NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='qatools-downloads' AND NOT public)
    OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='qatools-downloads' AND name=next_path)
  ) THEN RETURN jsonb_build_object('ok',false,'code','missing_file'); END IF;
  INSERT INTO public.product_downloads(product_id,file_path,file_name,enabled)
    VALUES(p_product_id,next_path,next_name,p_enabled)
    ON CONFLICT(product_id) DO UPDATE SET file_path=excluded.file_path,file_name=excluded.file_name,enabled=excluded.enabled
    WHERE product_downloads.file_path IS NOT DISTINCT FROM p_expected_path;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','download_changed'); END IF;
  RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.set_product_download(uuid,bigint,text,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_product_download(uuid,bigint,text,text,text,boolean) TO service_role;
COMMIT;
