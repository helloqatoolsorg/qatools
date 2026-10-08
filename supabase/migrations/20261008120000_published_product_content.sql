BEGIN;
SET LOCAL lock_timeout='5s';
CREATE FUNCTION public.save_published_product_content(p_admin_id uuid,p_product_id bigint,p_expected_updated_at timestamptz,p_content jsonb,p_media jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.products; cat bigint; difficulty bigint; rows jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=p_admin_id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
 SELECT * INTO item FROM public.products WHERE id=p_product_id FOR UPDATE;
 IF NOT FOUND OR NOT item.published OR p_expected_updated_at IS NULL OR item.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'Product changed' USING ERRCODE='40001'; END IF;
 IF p_content IS NULL OR jsonb_typeof(p_content)<>'object' THEN RAISE EXCEPTION 'Invalid content' USING ERRCODE='22023'; END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(p_content))<>4 OR NOT p_content ?& ARRAY['subtitle','description','category_id','complexity_id'] OR jsonb_typeof(p_content->'subtitle') IS DISTINCT FROM 'string' OR jsonb_typeof(p_content->'description') IS DISTINCT FROM 'string' OR length(btrim(p_content->>'subtitle'))=0 OR length(p_content->>'subtitle')>200 OR length(btrim(p_content->>'description'))=0 OR length(p_content->>'description')>20000 OR jsonb_typeof(p_content->'category_id') IS DISTINCT FROM 'number' OR jsonb_typeof(p_content->'complexity_id') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid content' USING ERRCODE='22023'; END IF;
 IF (p_content->>'category_id')::numeric NOT BETWEEN 1 AND 9007199254740991 OR (p_content->>'complexity_id')::numeric NOT BETWEEN 1 AND 9007199254740991 THEN RAISE EXCEPTION 'Invalid tags' USING ERRCODE='22023'; END IF;
 IF trunc((p_content->>'category_id')::numeric)<>(p_content->>'category_id')::numeric OR trunc((p_content->>'complexity_id')::numeric)<>(p_content->>'complexity_id')::numeric THEN RAISE EXCEPTION 'Invalid tags' USING ERRCODE='22023'; END IF;
 cat=(p_content->>'category_id')::bigint; difficulty=(p_content->>'complexity_id')::bigint;
 IF (p_content->>'category_id')::numeric<>cat OR (p_content->>'complexity_id')::numeric<>difficulty OR NOT EXISTS(SELECT 1 FROM public.category WHERE id=cat AND (active OR id=item.category_id)) OR NOT EXISTS(SELECT 1 FROM public.complexity WHERE id=difficulty AND (active OR id=item.complexity_id)) THEN RAISE EXCEPTION 'Invalid tags' USING ERRCODE='22023'; END IF;
 -- Calling the existing artwork writer inside this function keeps content and media atomic.
 IF p_media IS NOT NULL THEN PERFORM public.save_product_artwork(p_admin_id,item.id,p_expected_updated_at,p_media); END IF;
 UPDATE public.products SET subtitle=btrim(p_content->>'subtitle'),description=btrim(p_content->>'description'),category_id=cat,complexity_id=difficulty,updated_at=clock_timestamp() WHERE id=item.id RETURNING * INTO item;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'file_path',file_path,'role',role,'sort_order',sort_order) ORDER BY sort_order,id),'[]'::jsonb) INTO rows FROM public.product_media WHERE product_id=item.id;
 RETURN jsonb_build_object('id',item.id,'updated_at',item.updated_at,'media',rows);
END $$;
REVOKE ALL ON FUNCTION public.save_published_product_content(uuid,bigint,timestamptz,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_published_product_content(uuid,bigint,timestamptz,jsonb,jsonb) TO service_role;
COMMIT;

