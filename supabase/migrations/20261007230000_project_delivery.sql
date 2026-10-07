-- Projects reuse purchase-origin ownership and immutable release membership.
BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.bundle_releases ADD COLUMN project_sha256 text CHECK(project_sha256 ~ '^[a-f0-9]{64}$');
CREATE OR REPLACE FUNCTION public.set_bundle_download(p_admin_id uuid,p_product_id bigint,p_expected_path text,p_file_path text,p_file_name text,p_tool_ids bigint[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; item public.products; selected bigint[];
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=p_admin_id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN RETURN jsonb_build_object('ok',false); END IF;
 SELECT * INTO item FROM public.products WHERE id=p_product_id FOR UPDATE;
 SELECT array_agg(tool_id ORDER BY tool_id) INTO selected FROM public.product_members WHERE product_id=p_product_id;
 IF item.product_type IS DISTINCT FROM 'bundle' OR selected IS NULL OR selected IS DISTINCT FROM p_tool_ids THEN RETURN jsonb_build_object('ok',false); END IF;
 -- The trusted route validated every HDA before calling this writer. The mapping and attestation commit together.
 INSERT INTO public.bundle_releases(product_id,file_path,tool_ids) VALUES(p_product_id,p_file_path,p_tool_ids) ON CONFLICT(product_id) DO UPDATE SET file_path=excluded.file_path,tool_ids=excluded.tool_ids;
 result:=public.set_product_download(p_admin_id,p_product_id,p_expected_path,p_file_path,p_file_name,true);
 IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Bundle download changed' USING ERRCODE='40001'; END IF;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.set_product_download(
  p_admin_id uuid, p_product_id bigint, p_expected_path text,
  p_file_path text, p_file_name text, p_enabled boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous public.product_downloads%ROWTYPE; next_path text; next_name text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=p_admin_id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN RETURN jsonb_build_object('ok',false,'code','not_admin'); END IF;
  IF p_file_path IS NOT NULL AND EXISTS(SELECT 1 FROM public.products WHERE id=p_product_id AND product_type IN ('bundle','project')) AND NOT EXISTS(SELECT 1 FROM public.bundle_releases WHERE product_id=p_product_id AND file_path=p_file_path AND (NOT EXISTS(SELECT 1 FROM public.products WHERE id=p_product_id AND product_type='project') OR project_sha256 IS NOT NULL)) THEN RETURN jsonb_build_object('ok',false,'code','bundle_validation_required'); END IF;
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
CREATE OR REPLACE FUNCTION public.set_assembled_project_download(p_admin_id uuid,p_product_id bigint,p_expected_path text,p_file_path text,p_file_name text,p_sources jsonb,p_project_sha256 text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE source jsonb; selected bigint[]; supplied bigint[];
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=p_admin_id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN RETURN jsonb_build_object('ok',false); END IF;
 IF p_project_sha256 IS NULL OR p_project_sha256 !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('ok',false); END IF;
 IF jsonb_typeof(p_sources) IS DISTINCT FROM 'array' OR jsonb_array_length(p_sources) NOT BETWEEN 1 AND 100 THEN RETURN jsonb_build_object('ok',false); END IF;
 PERFORM 1 FROM public.products WHERE id=p_product_id AND product_type='project' FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false); END IF;
 -- Membership writers also lock the parent product before editing its selection.
 SELECT array_agg(tool_id ORDER BY tool_id) INTO selected FROM public.product_members WHERE product_id=p_product_id;
 SELECT array_agg((x->>'tool_id')::bigint ORDER BY (x->>'tool_id')::bigint) INTO supplied FROM jsonb_array_elements(p_sources) x;
 IF selected IS DISTINCT FROM supplied THEN RETURN jsonb_build_object('ok',false); END IF;
 FOR source IN SELECT value FROM jsonb_array_elements(p_sources) ORDER BY (value->>'tool_id')::bigint LOOP
  PERFORM 1 FROM public.products WHERE id=(source->>'tool_id')::bigint AND product_type='tool' AND published FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false); END IF;
  PERFORM 1 FROM public.product_downloads WHERE product_id=(source->>'tool_id')::bigint AND enabled AND file_path=source->>'file_path' FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false); END IF;
 END LOOP;
 INSERT INTO public.bundle_releases(product_id,file_path,tool_ids,project_sha256) VALUES(p_product_id,p_file_path,supplied,p_project_sha256) ON CONFLICT(product_id) DO UPDATE SET file_path=excluded.file_path,tool_ids=excluded.tool_ids,project_sha256=excluded.project_sha256;
 IF public.set_product_download(p_admin_id,p_product_id,p_expected_path,p_file_path,p_file_name,true)->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Project download changed' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.set_assembled_project_download(uuid,bigint,text,text,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_assembled_project_download(uuid,bigint,text,text,text,jsonb,text) TO service_role;
CREATE OR REPLACE FUNCTION public.project_entitlement_origins() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE targets bigint[]; target bigint; effective text; inherited_source text;
BEGIN
 -- Nested projection writes must never be mistaken for a new commercial grant.
 IF pg_trigger_depth()>1 OR NEW.source='bundle' THEN RETURN NEW; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-ownership:'||NEW.user_id::text,0));
 targets:=ARRAY[NEW.product_id];
 IF TG_OP='INSERT' OR NOT EXISTS(SELECT 1 FROM public.entitlement_origins WHERE root_id=NEW.id) THEN
  IF NEW.order_item_id IS NOT NULL THEN SELECT targets||bundled_tool_ids INTO targets FROM public.order_items WHERE id=NEW.order_item_id;
  ELSIF EXISTS(SELECT 1 FROM public.products WHERE id=NEW.product_id AND product_type IN ('bundle','project')) THEN
   SELECT targets||r.tool_ids INTO targets FROM public.bundle_releases r JOIN public.products p ON p.id=r.product_id WHERE r.product_id=NEW.product_id AND p.published;
   IF targets IS NULL THEN RAISE EXCEPTION 'Published bundle release required' USING ERRCODE='22023'; END IF;
  END IF;
  INSERT INTO public.entitlement_origins(root_id,tool_id,status) SELECT NEW.id,unnest(targets),NEW.status ON CONFLICT(root_id,tool_id) DO UPDATE SET status=excluded.status;
 ELSE
  UPDATE public.entitlement_origins SET status=NEW.status WHERE root_id=NEW.id;
  SELECT array_agg(tool_id ORDER BY tool_id) INTO targets FROM public.entitlement_origins WHERE root_id=NEW.id;
 END IF;
 FOREACH target IN ARRAY targets LOOP
  SELECT CASE WHEN bool_or(g.status='active') THEN 'active' WHEN bool_or(g.status='revoked') THEN 'revoked' ELSE 'refunded' END INTO effective
   FROM public.entitlement_origins g JOIN public.entitlements r ON r.id=g.root_id WHERE r.user_id=NEW.user_id AND g.tool_id=target;
  SELECT CASE WHEN bool_or(g.status='active' AND r.source='purchase') THEN 'bundle' WHEN bool_or(g.status='active' AND r.source='admin') THEN 'admin' ELSE 'bundle' END INTO inherited_source
   FROM public.entitlement_origins g JOIN public.entitlements r ON r.id=g.root_id WHERE r.user_id=NEW.user_id AND g.tool_id=target;
  INSERT INTO public.entitlements(user_id,product_id,source,status) VALUES(NEW.user_id,target,inherited_source,effective)
   ON CONFLICT(user_id,product_id) DO UPDATE SET status=excluded.status,
    source=CASE WHEN EXISTS(SELECT 1 FROM public.entitlement_origins WHERE root_id=entitlements.id) THEN entitlements.source ELSE excluded.source END
    WHERE entitlements.status<>'revoked' AND (entitlements.status IS DISTINCT FROM excluded.status OR (entitlements.source IS DISTINCT FROM excluded.source AND NOT EXISTS(SELECT 1 FROM public.entitlement_origins WHERE root_id=entitlements.id)));
 END LOOP;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.reserve_sandbox_cart(p_user_id uuid,p_items jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; line jsonb; item public.products; release public.bundle_releases; pinned jsonb:='{}';
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-ownership:'||p_user_id::text,0));
 IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN RETURN jsonb_build_object('ok',false); END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  SELECT * INTO item FROM public.products WHERE id=(line->>'productId')::bigint FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','unsupported_product'); END IF;
  IF item.product_type IN ('bundle','project') THEN
   SELECT * INTO release FROM public.bundle_releases WHERE product_id=item.id;
   IF NOT FOUND OR (item.product_type='project' AND release.project_sha256 IS NULL) OR NOT EXISTS(SELECT 1 FROM public.product_downloads WHERE product_id=item.id AND enabled AND file_path=release.file_path)
    OR release.tool_ids IS DISTINCT FROM (SELECT array_agg(tool_id ORDER BY tool_id) FROM public.product_members WHERE product_id=item.id)
    THEN RETURN jsonb_build_object('ok',false,'code','bundle_not_ready'); END IF;
   IF EXISTS(SELECT 1 FROM public.entitlements WHERE user_id=p_user_id AND product_id=ANY(release.tool_ids) AND status='revoked') THEN RETURN jsonb_build_object('ok',false,'code','revoked_access'); END IF;
   pinned:=pinned||jsonb_build_object(item.id::text,to_jsonb(release.tool_ids));
  END IF;
 END LOOP;
 result:=public.reserve_sandbox_cart_base(p_user_id,p_items);
 IF result->>'created'='true' THEN UPDATE public.sandbox_checkout_intents SET bundle_members=pinned WHERE id=(result->'intent'->>'id')::uuid; END IF;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.product_publication_checks(p_admin_id uuid,p_product_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.products; missing text[]:='{}';
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=p_admin_id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
 SELECT * INTO item FROM public.products WHERE id=p_product_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Product not found' USING ERRCODE='22023'; END IF;
 IF item.product_type IN ('bundle','project') THEN
  IF item.price_eur IS NULL OR item.price_eur<=0 THEN missing:=array_append(missing,CASE WHEN item.product_type='project' THEN 'Project price greater than zero' ELSE 'Bundle price greater than zero' END); END IF;
  IF EXISTS(SELECT 1 FROM public.product_members m JOIN public.products p ON p.id=m.tool_id WHERE m.product_id=item.id AND (NOT p.published OR p.product_type<>'tool')) THEN missing:=array_append(missing,'Published individual tools'); END IF;
  IF NOT EXISTS(SELECT 1 FROM public.bundle_releases r JOIN public.product_downloads d ON d.product_id=r.product_id AND d.file_path=r.file_path AND d.enabled WHERE r.product_id=item.id AND (item.product_type<>'project' OR r.project_sha256 IS NOT NULL) AND r.tool_ids=(SELECT array_agg(tool_id ORDER BY tool_id) FROM public.product_members WHERE product_id=item.id)) THEN missing:=array_append(missing,CASE WHEN item.product_type='project' THEN 'Project ZIP and installer matching the included tools' ELSE 'Bundle ZIP matching the included tools' END); END IF;
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
-- Readiness and the trusted archive attestation now replace the blanket draft gate.
ALTER TABLE public.products DROP CONSTRAINT projects_remain_drafts;
COMMIT;
