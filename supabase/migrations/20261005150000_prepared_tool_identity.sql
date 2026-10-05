BEGIN;
-- New-tool display labels and stable licensing identifiers are separate.
ALTER TABLE public.products ADD COLUMN prepared_identity jsonb;
ALTER FUNCTION public.save_product_draft(uuid,uuid,jsonb,bigint,timestamptz) RENAME TO save_product_draft_legacy;
REVOKE ALL ON FUNCTION public.save_product_draft_legacy(uuid,uuid,jsonb,bigint,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.save_product_draft(p_admin_id uuid,p_request_id uuid,p_data jsonb,p_product_id bigint DEFAULT NULL,p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.products; result jsonb; translated jsonb;
BEGIN
 IF p_product_id IS NULL AND p_data->>'product_type'='tool' THEN RAISE EXCEPTION 'Upload a prepared tool first' USING ERRCODE='22023'; END IF;
 IF p_product_id IS NOT NULL THEN
  SELECT * INTO item FROM public.products WHERE id=p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft not found' USING ERRCODE='22023'; END IF;
  IF item.product_type='tool' AND (p_data->>'name' IS DISTINCT FROM item.name OR (p_data ? 'slug' AND p_data->>'slug' IS DISTINCT FROM item.slug)) THEN RAISE EXCEPTION 'Tool identity is locked' USING ERRCODE='22023'; END IF;
 END IF;
 translated:=p_data;
 IF item.product_type='tool' THEN translated:=jsonb_set(p_data,'{name}',to_jsonb(item.slug)); END IF;
 result:=public.save_product_draft_legacy(p_admin_id,p_request_id,translated,p_product_id,p_expected_updated_at);
 IF item.product_type='tool' THEN UPDATE public.products SET name=item.name WHERE id=p_product_id; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.save_product_draft(uuid,uuid,jsonb,bigint,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_product_draft(uuid,uuid,jsonb,bigint,timestamptz) TO service_role;
CREATE FUNCTION public.import_prepared_tool(p_admin_id uuid,p_request_id uuid,p_identity jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.products; result jsonb; label text:=p_identity->>'label'; slug text:=p_identity->>'slug';
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=p_admin_id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_identity IS NULL OR p_identity->>'schema' IS DISTINCT FROM '1' OR label IS NULL OR length(label)>80 OR label !~ '^[A-Za-z][A-Za-z0-9]*( [A-Za-z0-9]+)*$' OR p_identity->>'internal_name' IS DISTINCT FROM replace(label,' ','_') OR slug IS DISTINCT FROM lower(replace(label,' ','_')) OR p_identity->>'sha256' IS NULL OR p_identity->>'sha256' !~ '^[a-f0-9]{64}$' OR p_identity->>'file' IS NULL OR p_identity->>'file' NOT IN (slug||'.hda',slug||'.hdalc',slug||'.hdanc') THEN RAISE EXCEPTION 'Invalid prepared identity' USING ERRCODE='22023'; END IF;
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
CREATE OR REPLACE FUNCTION public.product_publication_checks(p_admin_id uuid,p_product_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.products; missing text[]:='{}';
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=p_admin_id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
 SELECT * INTO item FROM public.products WHERE id=p_product_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Product not found' USING ERRCODE='22023'; END IF;
 IF item.product_type='project' THEN missing:=array_append(missing,'Project ownership and delivery verification'); END IF;
 IF item.product_type='bundle' THEN
  IF item.price_eur IS NULL OR item.price_eur<=0 OR item.price_eur>=(SELECT coalesce(sum(p.price_eur),0) FROM public.product_members m JOIN public.products p ON p.id=m.tool_id WHERE m.product_id=item.id) THEN missing:=array_append(missing,'Bundle price below the included tools total'); END IF;
  IF EXISTS(SELECT 1 FROM public.product_members m JOIN public.products p ON p.id=m.tool_id WHERE m.product_id=item.id AND (NOT p.published OR p.product_type<>'tool')) THEN missing:=array_append(missing,'Published individual tools'); END IF;
  IF NOT EXISTS(SELECT 1 FROM public.bundle_releases r JOIN public.product_downloads d ON d.product_id=r.product_id AND d.file_path=r.file_path AND d.enabled WHERE r.product_id=item.id AND r.tool_ids=(SELECT array_agg(tool_id ORDER BY tool_id) FROM public.product_members WHERE product_id=item.id)) THEN missing:=array_append(missing,'Bundle ZIP matching the included tools'); END IF;
 END IF;
 IF length(btrim(item.name)) NOT BETWEEN 1 AND 80 OR item.slug !~ '^[a-z0-9][a-z0-9_-]{0,79}$' THEN missing:=array_append(missing,'Valid title'); END IF;
 IF length(btrim(item.subtitle))=0 THEN missing:=array_append(missing,'Subtitle'); END IF;
 IF length(btrim(item.description))=0 THEN missing:=array_append(missing,'Description'); END IF;
 IF length(btrim(item.compatibility))=0 THEN missing:=array_append(missing,'Compatibility'); END IF;
 IF length(btrim(item.current_version))=0 THEN missing:=array_append(missing,'Version'); END IF;
 IF item.price_eur IS NULL OR item.price_eur<0 OR item.price_eur<>round(item.price_eur,2) THEN missing:=array_append(missing,'Valid price'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.category WHERE id=item.category_id AND active) THEN missing:=array_append(missing,'Active category'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.complexity WHERE id=item.complexity_id AND active) THEN missing:=array_append(missing,'Active complexity'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.product_media WHERE product_id=item.id AND role='card' AND file_path IS NOT NULL) THEN missing:=array_append(missing,'Main image'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.product_downloads WHERE product_id=item.id AND enabled AND file_path<>'') THEN missing:=array_append(missing,'Enabled download package'); END IF;
 IF item.product_type<>'tool' AND NOT EXISTS(SELECT 1 FROM public.product_members WHERE product_id=item.id) THEN missing:=array_append(missing,'Included tools'); END IF;
 IF item.price_eur>0 AND NOT EXISTS(SELECT 1 FROM public.sandbox_product_prices WHERE product_id=item.id AND enabled) THEN missing:=array_append(missing,'Verified Paddle price'); END IF;
 RETURN jsonb_build_object('missing',to_jsonb(missing),'ready',cardinality(missing)=0,'updated_at',item.updated_at);
END $$;
CREATE FUNCTION public.replace_prepared_tool_download(p_admin_id uuid,p_product_id bigint,p_expected_path text,p_file_path text,p_file_name text,p_identity jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.products; result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=p_admin_id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
 SELECT * INTO item FROM public.products WHERE id=p_product_id FOR UPDATE;
 IF item.prepared_identity IS NULL OR (p_identity-'sha256') IS DISTINCT FROM (item.prepared_identity-'sha256') OR p_identity->>'sha256' IS NULL OR p_identity->>'sha256' !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Tool identity is locked' USING ERRCODE='22023'; END IF;
 result:=public.set_product_download(p_admin_id,p_product_id,p_expected_path,p_file_path,p_file_name,true);
 IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Download changed' USING ERRCODE='40001'; END IF;
 UPDATE public.products SET prepared_identity=p_identity WHERE id=p_product_id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.replace_prepared_tool_download(uuid,bigint,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.replace_prepared_tool_download(uuid,bigint,text,text,text,jsonb) TO service_role;
COMMIT;
