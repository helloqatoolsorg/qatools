BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE public.product_download_events (
  id uuid PRIMARY KEY, product_id bigint NOT NULL REFERENCES public.products(id),
  source text NOT NULL CHECK(source IN ('free','purchase','admin')),
  requested_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_download_events_product_source ON public.product_download_events(product_id,source);
ALTER TABLE public.product_download_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_download_events FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.record_product_download(p_request_id uuid,p_user_id uuid,p_product_id bigint,p_file_path text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE acquired_source text;
BEGIN
  IF p_request_id IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id AND email_confirmed_at IS NOT NULL
    AND (banned_until IS NULL OR banned_until<=now())) THEN RETURN false; END IF;
  SELECT source INTO acquired_source FROM public.entitlements WHERE user_id=p_user_id AND product_id=p_product_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public.product_downloads WHERE product_id=p_product_id AND enabled AND file_path=p_file_path FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.product_download_events(id,product_id,source) VALUES(p_request_id,p_product_id,acquired_source)
    ON CONFLICT(id) DO NOTHING;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.record_product_download(uuid,uuid,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_product_download(uuid,uuid,bigint,text) TO service_role;
CREATE FUNCTION public.read_admin_download_counts(p_admin_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=p_admin_id
    AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501';
  END IF;
  RETURN (SELECT jsonb_build_object('free',count(*) FILTER(WHERE source='free'),'paid',count(*) FILTER(WHERE source='purchase'),
    'admin',count(*) FILTER(WHERE source='admin'),'total',count(*)) FROM public.product_download_events);
END $$;
REVOKE ALL ON FUNCTION public.read_admin_download_counts(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_admin_download_counts(uuid) TO service_role;
COMMIT;
