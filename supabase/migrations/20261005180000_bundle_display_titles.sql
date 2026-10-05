BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.save_product_draft(p_admin_id uuid,p_request_id uuid,p_data jsonb,p_product_id bigint DEFAULT NULL,p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.products; result jsonb; translated jsonb; label text; identifier text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=p_admin_id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
 IF p_product_id IS NULL AND p_data->>'product_type'='tool' THEN RAISE EXCEPTION 'Upload a prepared tool first' USING ERRCODE='22023'; END IF;
 IF p_product_id IS NOT NULL THEN
  SELECT * INTO item FROM public.products WHERE id=p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft not found' USING ERRCODE='22023'; END IF;
  IF item.product_type='tool' AND (p_data->>'name' IS DISTINCT FROM item.name OR (p_data ? 'slug' AND p_data->>'slug' IS DISTINCT FROM item.slug)) THEN RAISE EXCEPTION 'Tool identity is locked' USING ERRCODE='22023'; END IF;
 ELSE
  SELECT * INTO item FROM public.products WHERE draft_request_id=p_request_id FOR UPDATE;
 END IF;
 translated:=p_data;
 IF p_data->>'product_type' IN ('bundle','project') THEN
  label:=p_data->>'name';
  IF label IS NULL OR length(label)>80 OR label<>btrim(label) OR label !~ '^[A-Za-z0-9][A-Za-z0-9 _-]*$' THEN RAISE EXCEPTION 'Invalid display title' USING ERRCODE='22023'; END IF;
  identifier:=coalesce(item.slug,lower(regexp_replace(label,' +','_','g')));
  IF p_data ? 'slug' AND p_data->>'slug' IS DISTINCT FROM identifier THEN RAISE EXCEPTION 'Product slug is locked' USING ERRCODE='22023'; END IF;
  translated:=jsonb_set(p_data,'{name}',to_jsonb(identifier));
 ELSIF item.product_type='tool' THEN
  label:=item.name; translated:=jsonb_set(p_data,'{name}',to_jsonb(item.slug));
 END IF;
 result:=public.save_product_draft_legacy(p_admin_id,p_request_id,translated,p_product_id,p_expected_updated_at);
 IF label IS NOT NULL THEN UPDATE public.products SET name=label WHERE id=(result->>'id')::bigint; END IF;
 SELECT * INTO item FROM public.products WHERE id=(result->>'id')::bigint;
 RETURN result||jsonb_build_object('name',item.name,'slug',item.slug,'updated_at',item.updated_at);
END $$;
REVOKE ALL ON FUNCTION public.save_product_draft(uuid,uuid,jsonb,bigint,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_product_draft(uuid,uuid,jsonb,bigint,timestamptz) TO service_role;
COMMIT;
