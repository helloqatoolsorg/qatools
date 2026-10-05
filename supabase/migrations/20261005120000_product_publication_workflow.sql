BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.products ADD COLUMN initial_release_date date;
UPDATE public.products SET initial_release_date=release_date WHERE published;
ALTER TABLE public.products ALTER COLUMN category_id DROP NOT NULL, ALTER COLUMN complexity_id DROP NOT NULL, ALTER COLUMN price_eur DROP NOT NULL;
ALTER TABLE public.products ADD CONSTRAINT published_metadata_present CHECK(NOT published OR (category_id IS NOT NULL AND complexity_id IS NOT NULL AND price_eur IS NOT NULL));
CREATE OR REPLACE FUNCTION public.save_product_draft(p_admin_id uuid,p_request_id uuid,p_data jsonb,
  p_product_id bigint DEFAULT NULL,p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.products; kind text; title text; amount numeric; ids bigint[]; cat bigint; difficulty bigint;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=p_admin_id
    AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501';
  END IF;
  IF p_request_id IS NULL OR p_data IS NULL OR jsonb_typeof(p_data)<>'object' THEN
    RAISE EXCEPTION 'Invalid draft' USING ERRCODE='22023';
  END IF;
  kind:=p_data->>'product_type'; title:=p_data->>'name';
  IF kind IS NULL OR kind NOT IN ('tool','bundle','project') OR title IS NULL OR title !~ '^[a-z0-9][a-z0-9_-]{0,79}$'
    OR coalesce(length(btrim(p_data->>'subtitle')),0) NOT BETWEEN 0 AND 200
    OR coalesce(length(btrim(p_data->>'description')),0) NOT BETWEEN 0 AND 20000
    OR coalesce(length(btrim(p_data->>'compatibility')),0) NOT BETWEEN 0 AND 200
    OR coalesce(length(btrim(p_data->>'current_version')),0) NOT BETWEEN 0 AND 40
    OR jsonb_typeof(p_data->'price_eur') NOT IN ('number','null')
    OR jsonb_typeof(p_data->'category_id') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_data->'complexity_id') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_data->'tool_ids') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_data->'tool_ids')>100 THEN
    RAISE EXCEPTION 'Invalid draft fields' USING ERRCODE='22023';
  END IF;
  amount:=(p_data->>'price_eur')::numeric; cat:=(p_data->>'category_id')::bigint; difficulty:=(p_data->>'complexity_id')::bigint;
  IF amount<0 OR amount>999999.99 OR amount<>round(amount,2)
    OR (p_data->>'category_id')::numeric<>cat OR (p_data->>'complexity_id')::numeric<>difficulty
    OR (cat<>0 AND NOT EXISTS(SELECT 1 FROM public.category WHERE id=cat AND active))
    OR (difficulty<>0 AND NOT EXISTS(SELECT 1 FROM public.complexity WHERE id=difficulty AND active)) THEN
    RAISE EXCEPTION 'Invalid price or lookup' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_data->'tool_ids') v WHERE jsonb_typeof(v)<>'number'
    OR v::text !~ '^[1-9][0-9]*$') THEN RAISE EXCEPTION 'Invalid included tool' USING ERRCODE='22023'; END IF;
  SELECT coalesce(array_agg(value::text::bigint),'{}'::bigint[]) INTO ids FROM jsonb_array_elements(p_data->'tool_ids');
  IF cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids)x)
    OR (kind='tool' AND cardinality(ids)<>0)
    OR EXISTS(SELECT 1 FROM unnest(ids) x WHERE NOT EXISTS(SELECT 1 FROM public.products WHERE id=x AND product_type='tool' AND published)) THEN
    RAISE EXCEPTION 'Invalid composition or bundle price' USING ERRCODE='22023';
  END IF;
  IF p_product_id IS NULL THEN
    -- Retrying a creation request returns the same draft, including after a lost response.
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
    SELECT * INTO item FROM public.products WHERE draft_request_id=p_request_id;
    IF FOUND THEN RETURN jsonb_build_object('id',item.id,'updated_at',item.updated_at); END IF;
    INSERT INTO public.products(name,slug,subtitle,description,price_eur,compatibility,current_version,category_id,complexity_id,product_type,draft_request_id,published,release_date)
    VALUES(title,title,btrim(p_data->>'subtitle'),btrim(p_data->>'description'),amount,btrim(p_data->>'compatibility'),btrim(p_data->>'current_version'),nullif(cat,0),nullif(difficulty,0),kind,p_request_id,false,NULL)
    RETURNING * INTO item;
  ELSE
    SELECT * INTO item FROM public.products WHERE id=p_product_id FOR UPDATE;
    IF NOT FOUND OR item.published OR item.updated_at IS DISTINCT FROM p_expected_updated_at OR item.product_type<>kind THEN
      RAISE EXCEPTION 'Draft changed or cannot be edited' USING ERRCODE='40001';
    END IF;
    UPDATE public.products SET name=title,slug=title,subtitle=btrim(p_data->>'subtitle'),description=btrim(p_data->>'description'),
      price_eur=amount,compatibility=btrim(p_data->>'compatibility'),current_version=btrim(p_data->>'current_version'),
      category_id=nullif(cat,0),complexity_id=nullif(difficulty,0),updated_at=clock_timestamp() WHERE id=item.id RETURNING * INTO item;
    DELETE FROM public.product_members WHERE product_id=item.id;
  END IF;
  INSERT INTO public.product_members(product_id,tool_id) SELECT item.id,x FROM unnest(ids)x;
  RETURN jsonb_build_object('id',item.id,'updated_at',item.updated_at);
END $$;
REVOKE ALL ON FUNCTION public.save_product_draft(uuid,uuid,jsonb,bigint,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_product_draft(uuid,uuid,jsonb,bigint,timestamptz) TO service_role;


CREATE OR REPLACE FUNCTION public.reserve_sandbox_catalog_setup(p_admin_id uuid,p_product_id bigint,p_slug text,p_amount integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tool public.products%ROWTYPE; job public.sandbox_catalog_setups%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.admin_users a JOIN auth.users u ON a.user_id=u.id WHERE a.user_id=p_admin_id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now()) FOR SHARE OF a,u;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-price:'||p_product_id::text,0));
  SELECT * INTO tool FROM public.products WHERE id=p_product_id AND price_eur>0 FOR SHARE;
  IF NOT FOUND OR tool.slug IS DISTINCT FROM p_slug OR tool.price_eur*100 IS DISTINCT FROM p_amount::numeric OR length(tool.slug) NOT BETWEEN 1 AND 150 THEN RETURN jsonb_build_object('ok',false,'code','tool_changed'); END IF;
  IF EXISTS(SELECT 1 FROM public.sandbox_product_prices WHERE product_id=p_product_id) THEN RETURN jsonb_build_object('ok',false,'code','mapped'); END IF;
  SELECT * INTO job FROM public.sandbox_catalog_setups WHERE product_id=p_product_id FOR UPDATE;
  IF FOUND THEN RETURN jsonb_build_object('ok',true,'created',false,'job',to_jsonb(job)); END IF;
  INSERT INTO public.sandbox_catalog_setups(product_id,admin_id,slug,amount_cents) VALUES(p_product_id,p_admin_id,p_slug,p_amount) RETURNING * INTO job;
  RETURN jsonb_build_object('ok',true,'created',true,'job',to_jsonb(job));
END $$;

CREATE OR REPLACE FUNCTION public.complete_sandbox_catalog_setup(p_admin_id uuid,p_attempt_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job public.sandbox_catalog_setups%ROWTYPE; saved jsonb;
BEGIN
  PERFORM 1 FROM public.admin_users a JOIN auth.users u ON a.user_id=u.id WHERE a.user_id=p_admin_id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now()) FOR SHARE OF a,u;
  IF NOT FOUND THEN RETURN false; END IF;
  -- Same lock order as reservation and manual mapping; avoid job/price-lock inversion.
  SELECT * INTO job FROM public.sandbox_catalog_setups WHERE attempt_id=p_attempt_id;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-price:'||job.product_id::text,0));
  SELECT * INTO job FROM public.sandbox_catalog_setups WHERE attempt_id=p_attempt_id FOR UPDATE;
  IF job.status IS DISTINCT FROM 'price_ready' THEN RETURN false; END IF;
  PERFORM 1 FROM public.products WHERE id=job.product_id AND slug=job.slug AND price_eur*100=job.amount_cents FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  saved := public.set_sandbox_product_price(p_admin_id,job.product_id,'',false,job.price_id,job.paddle_product_id,true);
  IF saved->>'ok' IS DISTINCT FROM 'true' THEN RETURN false; END IF;
  UPDATE public.sandbox_catalog_setups SET status='complete',updated_at=now() WHERE attempt_id=p_attempt_id;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.set_sandbox_product_price(p_admin_id uuid,p_product_id bigint,p_expected_price text,p_expected_enabled boolean,p_price_id text,p_paddle_product_id text,p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE prior public.sandbox_product_prices%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=p_admin_id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now()) FOR SHARE OF a,u;
  IF NOT FOUND OR p_price_id IS NULL OR p_price_id !~ '^pri_[a-z0-9]{26}$' OR p_paddle_product_id IS NULL OR p_paddle_product_id !~ '^pro_[a-z0-9]{26}$' OR p_enabled IS NULL THEN RETURN jsonb_build_object('ok',false); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-price:'||p_product_id::text,0));
  PERFORM 1 FROM public.products WHERE id=p_product_id AND (NOT p_enabled OR (price_eur>0 AND price_eur*100=trunc(price_eur*100))) FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false); END IF;
  SELECT * INTO prior FROM public.sandbox_product_prices WHERE product_id=p_product_id FOR UPDATE;
  IF FOUND THEN
    IF prior.price_id IS DISTINCT FROM p_expected_price OR prior.enabled IS DISTINCT FROM p_expected_enabled THEN RETURN jsonb_build_object('ok',false); END IF;
    UPDATE public.sandbox_product_prices SET price_id=p_price_id,paddle_product_id=p_paddle_product_id,enabled=p_enabled WHERE product_id=p_product_id;
  ELSE
    IF p_expected_price IS DISTINCT FROM '' THEN RETURN jsonb_build_object('ok',false); END IF;
    INSERT INTO public.sandbox_product_prices VALUES(p_product_id,p_price_id,p_paddle_product_id,p_enabled);
  END IF;
  RETURN jsonb_build_object('ok',true);
END $$;


CREATE OR REPLACE FUNCTION public.attach_product_draft_image(p_admin_id uuid,p_product_id bigint,p_path text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.products; next_order integer;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=p_admin_id
    AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO item FROM public.products WHERE id=p_product_id FOR UPDATE;
  IF NOT FOUND OR item.published THEN RAISE EXCEPTION 'Unpublished draft required' USING ERRCODE='40001'; END IF;
  IF p_path IS NULL OR p_path !~ ('^drafts/'||p_product_id||'/[0-9a-f-]{36}\.(png|jpg|webp|gif)$') THEN
    RAISE EXCEPTION 'Invalid media path' USING ERRCODE='22023';
  END IF;
  SELECT coalesce(max(sort_order),-1)+1 INTO next_order FROM public.product_media WHERE product_id=item.id;
  IF next_order>=20 THEN RAISE EXCEPTION 'Media limit reached' USING ERRCODE='22023'; END IF;
  INSERT INTO public.product_media(product_id,media_type,file_path,role,sort_order)
    VALUES(item.id,'image',p_path,CASE WHEN next_order=0 THEN 'card' ELSE 'gallery' END,next_order);
  UPDATE public.products SET updated_at=clock_timestamp() WHERE id=item.id RETURNING * INTO item;
  RETURN jsonb_build_object('id',item.id,'updated_at',item.updated_at);
END $$;
REVOKE ALL ON FUNCTION public.attach_product_draft_image(uuid,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.attach_product_draft_image(uuid,bigint,text) TO service_role;

CREATE OR REPLACE FUNCTION public.set_product_draft_card(p_admin_id uuid,p_product_id bigint,p_expected_media_id bigint,p_expected_updated_at timestamptz,p_path text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.products; previous public.product_media; chosen public.product_media;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=p_admin_id
    AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO item FROM public.products WHERE id=p_product_id FOR UPDATE;
  IF NOT FOUND OR item.published OR item.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Draft changed' USING ERRCODE='40001';
  END IF;
  SELECT * INTO previous FROM public.product_media WHERE product_id=item.id AND role='card' ORDER BY id LIMIT 1;
  IF previous.id IS DISTINCT FROM p_expected_media_id THEN RAISE EXCEPTION 'Image changed' USING ERRCODE='40001'; END IF;
  IF p_path IS NULL OR p_path !~ ('^drafts/'||p_product_id||'/[0-9a-f-]{36}\.(png|jpg|webp|gif)$') THEN
    RAISE EXCEPTION 'Invalid media path' USING ERRCODE='22023';
  END IF;
  IF previous.id IS NULL THEN
    IF (SELECT count(*) FROM public.product_media WHERE product_id=item.id)>=20 THEN RAISE EXCEPTION 'Media limit reached' USING ERRCODE='22023'; END IF;
    INSERT INTO public.product_media(product_id,media_type,file_path,role,sort_order) VALUES(item.id,'image',p_path,'card',0) RETURNING * INTO chosen;
  ELSE
    UPDATE public.product_media SET file_path=p_path,external_url=NULL,media_type='image' WHERE id=previous.id RETURNING * INTO chosen;
  END IF;
  -- The first image is shared by card and tool-page hero; old objects stay intact.
  UPDATE public.product_media SET role='gallery' WHERE product_id=item.id AND id<>chosen.id AND role IN ('card','main');
  UPDATE public.products SET updated_at=clock_timestamp() WHERE id=item.id RETURNING * INTO item;
  RETURN jsonb_build_object('id',item.id,'updated_at',item.updated_at,'media_id',chosen.id);
END $$;
REVOKE ALL ON FUNCTION public.set_product_draft_card(uuid,bigint,bigint,timestamptz,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_product_draft_card(uuid,bigint,bigint,timestamptz,text) TO service_role;

CREATE FUNCTION public.product_publication_checks(p_admin_id uuid,p_product_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.products; missing text[]:='{}';
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=p_admin_id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
 SELECT * INTO item FROM public.products WHERE id=p_product_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Product not found' USING ERRCODE='22023'; END IF;
 IF item.product_type<>'tool' THEN missing:=array_append(missing,'Bundle/project ownership and delivery verification'); END IF;
 IF item.name<>item.slug OR item.slug !~ '^[a-z0-9][a-z0-9_-]{0,79}$' THEN missing:=array_append(missing,'Valid title'); END IF;
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
REVOKE ALL ON FUNCTION public.product_publication_checks(uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.product_publication_checks(uuid,bigint) TO service_role;
DROP FUNCTION public.publish_product_draft(uuid,bigint,timestamptz);
CREATE FUNCTION public.publish_product_draft(p_admin_id uuid,p_product_id bigint,p_expected_updated_at timestamptz,p_expected_price_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.products; checks jsonb;
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-price:'||p_product_id::text,0));
 SELECT * INTO item FROM public.products WHERE id=p_product_id FOR UPDATE;
 IF NOT FOUND OR item.published OR item.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'Draft changed' USING ERRCODE='40001'; END IF;
 checks:=public.product_publication_checks(p_admin_id,p_product_id);
 IF checks->>'ready' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Publication requirements missing' USING ERRCODE='22023'; END IF;
 IF item.price_eur>0 THEN
  PERFORM 1 FROM public.sandbox_product_prices WHERE product_id=item.id AND enabled AND price_id=p_expected_price_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Price changed' USING ERRCODE='40001'; END IF;
 END IF;
 UPDATE public.products SET published=true,release_date=coalesce(initial_release_date,(clock_timestamp() AT TIME ZONE 'UTC')::date),initial_release_date=coalesce(initial_release_date,(clock_timestamp() AT TIME ZONE 'UTC')::date),updated_at=clock_timestamp() WHERE id=item.id RETURNING * INTO item;
 RETURN jsonb_build_object('id',item.id,'updated_at',item.updated_at);
END $$;
REVOKE ALL ON FUNCTION public.publish_product_draft(uuid,bigint,timestamptz,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.publish_product_draft(uuid,bigint,timestamptz,text) TO service_role;
GRANT SELECT ON public.product_members TO anon,authenticated;
CREATE POLICY published_product_members ON public.product_members FOR SELECT TO anon,authenticated USING(
 EXISTS(SELECT 1 FROM public.products WHERE id=product_id AND published) AND EXISTS(SELECT 1 FROM public.products WHERE id=tool_id AND published)
);
COMMIT;
