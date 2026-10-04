BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.products ADD COLUMN product_type text NOT NULL DEFAULT 'tool'
  CHECK (product_type IN ('tool','bundle','project'));
ALTER TABLE public.products ADD COLUMN draft_request_id uuid UNIQUE;
-- Composition fulfillment is not enabled yet: new composed products remain drafts.
ALTER TABLE public.products ADD CONSTRAINT composed_products_remain_drafts CHECK (product_type='tool' OR NOT published);
CREATE UNIQUE INDEX products_slug_unique ON public.products(slug);
CREATE TABLE public.product_members (
  product_id bigint NOT NULL REFERENCES public.products(id),
  tool_id bigint NOT NULL REFERENCES public.products(id),
  PRIMARY KEY(product_id,tool_id), CHECK(product_id<>tool_id)
);
ALTER TABLE public.product_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_members FROM anon,authenticated;
GRANT SELECT ON public.product_members TO service_role;
GRANT SELECT ON public.products,public.category,public.complexity,public.product_media TO service_role;

CREATE FUNCTION public.save_product_draft(p_admin_id uuid,p_request_id uuid,p_data jsonb,
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
    OR coalesce(length(btrim(p_data->>'subtitle')),0) NOT BETWEEN 1 AND 200
    OR coalesce(length(btrim(p_data->>'description')),0) NOT BETWEEN 1 AND 20000
    OR coalesce(length(btrim(p_data->>'compatibility')),0) NOT BETWEEN 1 AND 200
    OR coalesce(length(btrim(p_data->>'current_version')),0) NOT BETWEEN 1 AND 40
    OR jsonb_typeof(p_data->'price_eur') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_data->'category_id') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_data->'complexity_id') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_data->'tool_ids') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_data->'tool_ids')>100 THEN
    RAISE EXCEPTION 'Invalid draft fields' USING ERRCODE='22023';
  END IF;
  amount:=(p_data->>'price_eur')::numeric; cat:=(p_data->>'category_id')::bigint; difficulty:=(p_data->>'complexity_id')::bigint;
  IF amount<0 OR amount>999999.99 OR amount<>round(amount,2)
    OR (p_data->>'category_id')::numeric<>cat OR (p_data->>'complexity_id')::numeric<>difficulty
    OR NOT EXISTS(SELECT 1 FROM public.category WHERE id=cat AND active)
    OR NOT EXISTS(SELECT 1 FROM public.complexity WHERE id=difficulty AND active) THEN
    RAISE EXCEPTION 'Invalid price or lookup' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_data->'tool_ids') v WHERE jsonb_typeof(v)<>'number'
    OR v::text !~ '^[1-9][0-9]*$') THEN RAISE EXCEPTION 'Invalid included tool' USING ERRCODE='22023'; END IF;
  SELECT coalesce(array_agg(value::text::bigint),'{}'::bigint[]) INTO ids FROM jsonb_array_elements(p_data->'tool_ids');
  IF cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids)x)
    OR (kind='tool' AND cardinality(ids)<>0) OR (kind<>'tool' AND cardinality(ids)<1)
    OR EXISTS(SELECT 1 FROM unnest(ids) x WHERE NOT EXISTS(SELECT 1 FROM public.products WHERE id=x AND product_type='tool' AND published))
    OR (kind<>'tool' AND amount>=(SELECT sum(price_eur) FROM public.products WHERE id=ANY(ids))) THEN
    RAISE EXCEPTION 'Invalid composition or bundle price' USING ERRCODE='22023';
  END IF;
  IF p_product_id IS NULL THEN
    -- Retrying a creation request returns the same draft, including after a lost response.
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
    SELECT * INTO item FROM public.products WHERE draft_request_id=p_request_id;
    IF FOUND THEN RETURN jsonb_build_object('id',item.id,'updated_at',item.updated_at); END IF;
    INSERT INTO public.products(name,slug,subtitle,description,price_eur,compatibility,current_version,category_id,complexity_id,product_type,draft_request_id,published,release_date)
    VALUES(title,title,btrim(p_data->>'subtitle'),btrim(p_data->>'description'),amount,btrim(p_data->>'compatibility'),btrim(p_data->>'current_version'),cat,difficulty,kind,p_request_id,false,nullif(p_data->>'release_date','')::date)
    RETURNING * INTO item;
  ELSE
    SELECT * INTO item FROM public.products WHERE id=p_product_id FOR UPDATE;
    IF NOT FOUND OR item.published OR item.updated_at IS DISTINCT FROM p_expected_updated_at OR item.product_type<>kind THEN
      RAISE EXCEPTION 'Draft changed or cannot be edited' USING ERRCODE='40001';
    END IF;
    UPDATE public.products SET name=title,slug=title,subtitle=btrim(p_data->>'subtitle'),description=btrim(p_data->>'description'),
      price_eur=amount,compatibility=btrim(p_data->>'compatibility'),current_version=btrim(p_data->>'current_version'),
      category_id=cat,complexity_id=difficulty,release_date=nullif(p_data->>'release_date','')::date,updated_at=clock_timestamp() WHERE id=item.id RETURNING * INTO item;
    DELETE FROM public.product_members WHERE product_id=item.id;
  END IF;
  INSERT INTO public.product_members(product_id,tool_id) SELECT item.id,x FROM unnest(ids)x;
  RETURN jsonb_build_object('id',item.id,'updated_at',item.updated_at);
END $$;
REVOKE ALL ON FUNCTION public.save_product_draft(uuid,uuid,jsonb,bigint,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_product_draft(uuid,uuid,jsonb,bigint,timestamptz) TO service_role;

CREATE FUNCTION public.attach_product_draft_image(p_admin_id uuid,p_product_id bigint,p_path text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.products; next_order integer;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=p_admin_id
    AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO item FROM public.products WHERE id=p_product_id FOR UPDATE;
  IF NOT FOUND OR item.published THEN RAISE EXCEPTION 'Unpublished draft required' USING ERRCODE='40001'; END IF;
  IF p_path IS NULL OR p_path !~ ('^drafts/'||p_product_id||'/[0-9a-f-]{36}\.(png|jpg|webp)$') THEN
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
CREATE FUNCTION public.publish_product_draft(p_admin_id uuid,p_product_id bigint,p_expected_updated_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.products;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=p_admin_id
    AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO item FROM public.products WHERE id=p_product_id FOR UPDATE;
  IF NOT FOUND OR item.published OR item.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Draft changed' USING ERRCODE='40001';
  END IF;
  IF item.product_type<>'tool' OR item.name<>item.slug OR item.slug !~ '^[a-z0-9][a-z0-9_-]{0,79}$'
    OR length(btrim(item.subtitle))=0 OR length(btrim(item.description))=0 OR length(btrim(item.compatibility))=0
    OR length(btrim(item.current_version))=0 OR item.price_eur<0 OR item.price_eur<>round(item.price_eur,2)
    OR NOT EXISTS(SELECT 1 FROM public.category WHERE id=item.category_id AND active)
    OR NOT EXISTS(SELECT 1 FROM public.complexity WHERE id=item.complexity_id AND active)
    OR NOT EXISTS(SELECT 1 FROM public.product_media WHERE product_id=item.id AND file_path IS NOT NULL AND role='card')
    OR NOT EXISTS(SELECT 1 FROM public.product_downloads WHERE product_id=item.id AND enabled AND file_path<>'') THEN
    RAISE EXCEPTION 'Tool artwork and enabled download required' USING ERRCODE='22023';
  END IF;
  UPDATE public.products SET published=true,updated_at=clock_timestamp() WHERE id=item.id RETURNING * INTO item;
  RETURN jsonb_build_object('id',item.id,'updated_at',item.updated_at);
END $$;
REVOKE ALL ON FUNCTION public.publish_product_draft(uuid,bigint,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.publish_product_draft(uuid,bigint,timestamptz) TO service_role;
COMMIT;
