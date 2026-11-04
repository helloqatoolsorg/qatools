BEGIN;
SET LOCAL lock_timeout='5s';
CREATE FUNCTION public.enforce_published_package() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.published AND (TG_OP='INSERT' OR NOT OLD.published) THEN
  PERFORM 1 FROM public.product_downloads d JOIN storage.objects o ON o.bucket_id='qatools-downloads' AND o.name=d.file_path JOIN storage.buckets b ON b.id=o.bucket_id AND NOT b.public WHERE d.product_id=NEW.id AND d.enabled FOR SHARE OF d;
  IF NOT FOUND THEN RAISE EXCEPTION 'A stored, enabled download ZIP is required before publishing' USING ERRCODE='22023'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_published_package() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER require_package_before_publication BEFORE INSERT OR UPDATE OF published ON public.products FOR EACH ROW EXECUTE FUNCTION public.enforce_published_package();
CREATE FUNCTION public.protect_published_package() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.products WHERE id=OLD.product_id AND published) THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Unpublish the product before removing its download' USING ERRCODE='22023'; END IF;
  IF NOT NEW.enabled OR NOT EXISTS(SELECT 1 FROM storage.objects o JOIN storage.buckets b ON b.id=o.bucket_id AND NOT b.public WHERE o.bucket_id='qatools-downloads' AND o.name=NEW.file_path) THEN RAISE EXCEPTION 'A published product must retain its stored, enabled download' USING ERRCODE='22023'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_published_package() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER retain_published_download BEFORE UPDATE OR DELETE ON public.product_downloads FOR EACH ROW EXECUTE FUNCTION public.protect_published_package();
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
 IF NOT EXISTS(SELECT 1 FROM public.product_downloads d JOIN storage.objects o ON o.bucket_id='qatools-downloads' AND o.name=d.file_path JOIN storage.buckets b ON b.id=o.bucket_id AND NOT b.public WHERE d.product_id=item.id AND d.enabled) THEN missing:=array_append(missing,'Enabled download package'); END IF;
 IF item.product_type<>'tool' AND NOT EXISTS(SELECT 1 FROM public.product_members WHERE product_id=item.id) THEN missing:=array_append(missing,'Included tools'); END IF;
 IF item.price_eur>0 AND NOT EXISTS(SELECT 1 FROM public.sandbox_product_prices WHERE product_id=item.id AND enabled) THEN missing:=array_append(missing,'Verified Paddle price'); END IF;
 RETURN jsonb_build_object('missing',to_jsonb(missing),'ready',cardinality(missing)=0,'updated_at',item.updated_at);
END $$;

CREATE OR REPLACE FUNCTION public.live_product_publication_checks(p_admin_id uuid,p_product_id bigint)
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
 IF NOT EXISTS(SELECT 1 FROM public.product_downloads d JOIN storage.objects o ON o.bucket_id='qatools-downloads' AND o.name=d.file_path JOIN storage.buckets b ON b.id=o.bucket_id AND NOT b.public WHERE d.product_id=item.id AND d.enabled) THEN missing:=array_append(missing,'Enabled download package'); END IF;
 IF item.product_type<>'tool' AND NOT EXISTS(SELECT 1 FROM public.product_members WHERE product_id=item.id) THEN missing:=array_append(missing,'Included tools'); END IF;
 IF item.price_eur>0 AND NOT EXISTS(SELECT 1 FROM public.live_product_prices WHERE product_id=item.id AND enabled) THEN missing:=array_append(missing,'Verified Paddle price'); END IF;
 RETURN jsonb_build_object('missing',to_jsonb(missing),'ready',cardinality(missing)=0,'updated_at',item.updated_at);
END $$;
CREATE OR REPLACE FUNCTION public.save_product_artwork(p_admin_id uuid,p_product_id bigint,p_expected_updated_at timestamptz,p_media jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.products; entry jsonb; old public.product_media; seen bigint[]='{}'; media_id bigint; media_role text; path text; position integer=0; rows jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=p_admin_id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
 SELECT * INTO item FROM public.products WHERE id=p_product_id FOR UPDATE;
 IF NOT FOUND OR p_expected_updated_at IS NULL OR item.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'Product changed' USING ERRCODE='40001'; END IF;
 IF p_media IS NULL OR jsonb_typeof(p_media)<>'array' THEN RAISE EXCEPTION 'Invalid images'; END IF;
 IF jsonb_array_length(p_media)>11 OR (SELECT count(*) FROM jsonb_array_elements(p_media) x WHERE x->>'role' IN ('gallery','detail'))>9 THEN RAISE EXCEPTION 'Media limit reached'; END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(p_media) LOOP
  IF jsonb_typeof(entry)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(entry))<>3 OR NOT entry ?& ARRAY['id','role','path'] THEN RAISE EXCEPTION 'Invalid image'; END IF;
  media_id=(entry->>'id')::bigint;media_role=entry->>'role';path=entry->>'path';
  IF media_role IS NULL OR media_role NOT IN ('card','main','gallery','detail') OR path IS NULL THEN RAISE EXCEPTION 'Invalid image'; END IF;
  IF media_id IS NOT NULL THEN
   SELECT * INTO old FROM public.product_media WHERE id=media_id AND product_id=item.id;
   IF NOT FOUND OR media_id=ANY(seen) OR old.role IS DISTINCT FROM media_role THEN RAISE EXCEPTION 'Image selection changed'; END IF;
   seen=array_append(seen,media_id);
  ELSE
   IF media_role NOT IN ('card','gallery') OR (media_role='card' AND EXISTS(SELECT 1 FROM public.product_media WHERE product_id=item.id AND role IN ('main','card'))) THEN RAISE EXCEPTION 'Invalid new image'; END IF;
  END IF;
  IF media_id IS NULL OR path IS DISTINCT FROM old.file_path THEN
   IF path !~ ('^drafts/'||item.id||'/[0-9a-f-]{36}\.(png|jpg|webp|gif)$') OR NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='product-media' AND public) OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='product-media' AND name=path) THEN RAISE EXCEPTION 'Invalid image path'; END IF;
  END IF;
  IF media_id IS NULL THEN
   INSERT INTO public.product_media(product_id,media_type,file_path,role,sort_order) VALUES(item.id,'image',path,media_role,position) RETURNING id INTO media_id;
   seen=array_append(seen,media_id);
  ELSE
   UPDATE public.product_media SET file_path=path,sort_order=position,media_type=CASE WHEN path IS DISTINCT FROM old.file_path THEN 'image' ELSE media_type END,external_url=CASE WHEN path IS DISTINCT FROM old.file_path THEN NULL ELSE external_url END WHERE id=media_id;
  END IF;
  position=position+1;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.product_media WHERE product_id=item.id AND role IN ('card','main') AND NOT id=ANY(seen)) THEN RAISE EXCEPTION 'Main image cannot be removed'; END IF;
 DELETE FROM public.product_media WHERE product_id=item.id AND role IN ('gallery','detail') AND NOT id=ANY(seen);
 UPDATE public.products SET updated_at=clock_timestamp() WHERE id=item.id RETURNING * INTO item;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'file_path',file_path,'role',role,'sort_order',sort_order) ORDER BY sort_order,id),'[]'::jsonb) INTO rows FROM public.product_media WHERE product_id=item.id;
 RETURN jsonb_build_object('id',item.id,'updated_at',item.updated_at,'media',rows);
END $$;
REVOKE ALL ON FUNCTION public.product_publication_checks(uuid,bigint),public.live_product_publication_checks(uuid,bigint),public.save_product_artwork(uuid,bigint,timestamptz,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.product_publication_checks(uuid,bigint),public.live_product_publication_checks(uuid,bigint),public.save_product_artwork(uuid,bigint,timestamptz,jsonb) TO service_role;
COMMIT;
