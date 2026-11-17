BEGIN;
SET LOCAL lock_timeout = '5s';
-- Schema 2 identifies prepared Python shelf tools.
CREATE OR REPLACE FUNCTION public.import_prepared_tool(p_admin_id uuid,p_request_id uuid,p_identity jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.products; result jsonb; label text:=p_identity->>'label'; slug text:=p_identity->>'slug';
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=p_admin_id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_identity IS NULL OR coalesce(p_identity->>'schema','') NOT IN ('1','2') OR label IS NULL OR length(label)>80 OR label !~ '^[A-Za-z][A-Za-z0-9]*( [A-Za-z0-9]+)*$' OR p_identity->>'internal_name' IS DISTINCT FROM replace(label,' ','_') OR slug IS DISTINCT FROM lower(replace(label,' ','_')) OR p_identity->>'sha256' IS NULL OR p_identity->>'sha256' !~ '^[a-f0-9]{64}$' OR p_identity->>'file' IS NULL OR (p_identity->>'schema' = '2' AND p_identity->>'file' IS DISTINCT FROM (p_identity->>'internal_name')||'.shelf') OR (p_identity->>'schema' = '1' AND p_identity->>'file' NOT IN (slug||'.hda',slug||'.hdalc',slug||'.hdanc',(p_identity->>'internal_name')||'.hda',(p_identity->>'internal_name')||'.hdalc',(p_identity->>'internal_name')||'.hdanc')) THEN RAISE EXCEPTION 'Invalid prepared identity' USING ERRCODE='22023'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
 SELECT * INTO item FROM public.products WHERE draft_request_id=p_request_id FOR UPDATE;
 IF FOUND THEN
  IF item.prepared_identity IS DISTINCT FROM p_identity OR item.published THEN RAISE EXCEPTION 'Import request changed' USING ERRCODE='40001'; END IF;
 ELSE
  result:=public.save_product_draft_legacy(p_admin_id,p_request_id,jsonb_build_object('name',slug,'product_type','tool','subtitle','','description','','compatibility','','current_version','','price_eur',NULL,'release_date',NULL,'category_id',0,'complexity_id',0,'tool_ids','[]'::jsonb));
  UPDATE public.products SET name=label,prepared_identity=p_identity WHERE id=(result->>'id')::bigint RETURNING * INTO item;
 END IF;
 RETURN jsonb_build_object('id',item.id,'updated_at',item.updated_at,'name',item.name,'slug',item.slug);
END $$;
REVOKE ALL ON FUNCTION public.import_prepared_tool(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.import_prepared_tool(uuid,uuid,jsonb) TO service_role;
COMMIT;
