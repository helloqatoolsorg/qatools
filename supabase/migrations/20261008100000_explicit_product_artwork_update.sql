BEGIN;
SET LOCAL lock_timeout='5s';
CREATE FUNCTION public.save_product_artwork(p_admin_id uuid,p_product_id bigint,p_expected_updated_at timestamptz,p_media jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.products; entry jsonb; old public.product_media; seen bigint[]='{}'; media_id bigint; media_role text; path text; position integer=0; rows jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=p_admin_id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
 SELECT * INTO item FROM public.products WHERE id=p_product_id FOR UPDATE;
 IF NOT FOUND OR p_expected_updated_at IS NULL OR item.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'Product changed' USING ERRCODE='40001'; END IF;
 IF p_media IS NULL OR jsonb_typeof(p_media)<>'array' THEN RAISE EXCEPTION 'Invalid images'; END IF;
 IF jsonb_array_length(p_media)>20 THEN RAISE EXCEPTION 'Media limit reached'; END IF;
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
REVOKE ALL ON FUNCTION public.save_product_artwork(uuid,bigint,timestamptz,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_product_artwork(uuid,bigint,timestamptz,jsonb) TO service_role;
COMMIT;
