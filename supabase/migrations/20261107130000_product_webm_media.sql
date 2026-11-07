BEGIN;
SET LOCAL lock_timeout='5s';

-- Keep unrestricted buckets unrestricted and preserve every existing allowed type.
UPDATE storage.buckets
SET allowed_mime_types=array_append(allowed_mime_types,'video/webm')
WHERE id='product-media' AND allowed_mime_types IS NOT NULL
  AND array_position(allowed_mime_types,'video/webm') IS NULL;

-- Existing functions retain their service-role grants and product checks.
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
  IF p_path IS NULL OR p_path !~ ('^drafts/'||p_product_id||'/[0-9a-f-]{36}\.(png|jpg|webp|gif|webm)$') THEN
    RAISE EXCEPTION 'Invalid media path' USING ERRCODE='22023';
  END IF;
  IF previous.id IS NULL THEN
    IF (SELECT count(*) FROM public.product_media WHERE product_id=item.id)>=20 THEN RAISE EXCEPTION 'Media limit reached' USING ERRCODE='22023'; END IF;
    INSERT INTO public.product_media(product_id,media_type,file_path,role,sort_order) VALUES(item.id,CASE WHEN right(p_path,5)='.webm' THEN 'video' ELSE 'image' END,p_path,'card',0) RETURNING * INTO chosen;
  ELSE
    UPDATE public.product_media SET file_path=p_path,external_url=NULL,media_type=CASE WHEN right(p_path,5)='.webm' THEN 'video' ELSE 'image' END WHERE id=previous.id RETURNING * INTO chosen;
  END IF;
  -- The first image is shared by card and tool-page hero; old objects stay intact.
  UPDATE public.product_media SET role='gallery' WHERE product_id=item.id AND id<>chosen.id AND role IN ('card','main');
  UPDATE public.products SET updated_at=clock_timestamp() WHERE id=item.id RETURNING * INTO item;
  RETURN jsonb_build_object('id',item.id,'updated_at',item.updated_at,'media_id',chosen.id);
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
  IF p_path IS NULL OR p_path !~ ('^drafts/'||p_product_id||'/[0-9a-f-]{36}\.(png|jpg|webp|gif|webm)$') THEN
    RAISE EXCEPTION 'Invalid media path' USING ERRCODE='22023';
  END IF;
  SELECT coalesce(max(sort_order),-1)+1 INTO next_order FROM public.product_media WHERE product_id=item.id;
  IF (SELECT count(*) FROM public.product_media WHERE product_id=item.id)>=20 THEN RAISE EXCEPTION 'Media limit reached' USING ERRCODE='22023'; END IF;
  INSERT INTO public.product_media(product_id,media_type,file_path,role,sort_order)
    VALUES(item.id,CASE WHEN right(p_path,5)='.webm' THEN 'video' ELSE 'image' END,p_path,CASE WHEN next_order=0 THEN 'card' ELSE 'gallery' END,next_order);
  UPDATE public.products SET updated_at=clock_timestamp() WHERE id=item.id RETURNING * INTO item;
  RETURN jsonb_build_object('id',item.id,'updated_at',item.updated_at);
END $$;

CREATE OR REPLACE FUNCTION public.manage_product_gallery(p_admin_id uuid,p_product_id bigint,p_expected_updated_at timestamptz,p_action text,p_media_id bigint DEFAULT NULL,p_path text DEFAULT NULL,p_media_ids bigint[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.products; selected public.product_media; existing bigint[]; ordered bigint[]; rows jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=p_admin_id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
 SELECT * INTO item FROM public.products WHERE id=p_product_id FOR UPDATE;
 IF NOT FOUND OR p_expected_updated_at IS NULL OR item.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'Product changed' USING ERRCODE='40001'; END IF;
 IF p_action IS NULL OR p_action NOT IN ('add','replace','remove','reorder') THEN RAISE EXCEPTION 'Invalid gallery action' USING ERRCODE='22023'; END IF;
 IF p_action IN ('replace','remove') THEN
  SELECT * INTO selected FROM public.product_media WHERE id=p_media_id AND product_id=item.id AND role IN ('gallery','detail') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gallery image not found' USING ERRCODE='22023'; END IF;
 ELSIF p_media_id IS NOT NULL THEN RAISE EXCEPTION 'Unexpected image identifier' USING ERRCODE='22023'; END IF;
 IF p_action IN ('add','replace') THEN
  IF p_media_ids IS NOT NULL OR p_path IS NULL OR p_path !~ ('^drafts/'||item.id||'/[0-9a-f-]{36}\.(png|jpg|webp|gif|webm)$') OR NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='product-media' AND public) OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='product-media' AND name=p_path) THEN RAISE EXCEPTION 'Invalid gallery image' USING ERRCODE='22023'; END IF;
  IF p_action='add' THEN
   IF (SELECT count(*) FROM public.product_media WHERE product_id=item.id)>=20 THEN RAISE EXCEPTION 'Media limit reached' USING ERRCODE='22023'; END IF;
   INSERT INTO public.product_media(product_id,media_type,file_path,role,sort_order) VALUES(item.id,CASE WHEN right(p_path,5)='.webm' THEN 'video' ELSE 'image' END,p_path,'gallery',coalesce((SELECT max(sort_order)+1 FROM public.product_media WHERE product_id=item.id),1));
  ELSE
   UPDATE public.product_media SET media_type=CASE WHEN right(p_path,5)='.webm' THEN 'video' ELSE 'image' END,file_path=p_path,external_url=NULL WHERE id=selected.id;
  END IF;
 ELSE
  IF p_path IS NOT NULL THEN RAISE EXCEPTION 'Unexpected gallery upload' USING ERRCODE='22023'; END IF;
  IF p_action='remove' THEN
   IF p_media_ids IS NOT NULL THEN RAISE EXCEPTION 'Unexpected image selection' USING ERRCODE='22023'; END IF;
   DELETE FROM public.product_media WHERE id=selected.id;
  ELSE
   SELECT coalesce(array_agg(id ORDER BY id),'{}'::bigint[]) INTO existing FROM public.product_media WHERE product_id=item.id AND role IN ('gallery','detail');
   SELECT coalesce(array_agg(x ORDER BY x),'{}'::bigint[]) INTO ordered FROM unnest(p_media_ids) x;
   IF p_media_ids IS NULL OR array_position(p_media_ids,NULL) IS NOT NULL OR existing IS DISTINCT FROM ordered THEN RAISE EXCEPTION 'Gallery selection changed' USING ERRCODE='40001'; END IF;
   UPDATE public.product_media m SET sort_order=s.ordinal FROM unnest(p_media_ids) WITH ORDINALITY s(id,ordinal) WHERE m.product_id=item.id AND m.id=s.id;
  END IF;
 END IF;
 -- Keep a dense gallery order after edits, excluding card/main artwork.
 IF p_action<>'reorder' THEN
  WITH ranked AS(SELECT id,row_number() OVER(ORDER BY sort_order,id) n FROM public.product_media WHERE product_id=item.id AND role IN ('gallery','detail'))
  UPDATE public.product_media m SET sort_order=r.n FROM ranked r WHERE m.id=r.id;
 END IF;
 UPDATE public.products SET updated_at=clock_timestamp() WHERE id=item.id RETURNING * INTO item;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'file_path',file_path,'role',role,'sort_order',sort_order) ORDER BY sort_order,id),'[]'::jsonb) INTO rows FROM public.product_media WHERE product_id=item.id;
 RETURN jsonb_build_object('id',item.id,'updated_at',item.updated_at,'media',rows);
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
   IF path !~ ('^drafts/'||item.id||'/[0-9a-f-]{36}\.(png|jpg|webp|gif|webm)$') OR NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='product-media' AND public) OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='product-media' AND name=path) THEN RAISE EXCEPTION 'Invalid image path'; END IF;
  END IF;
  IF media_id IS NULL THEN
   INSERT INTO public.product_media(product_id,media_type,file_path,role,sort_order) VALUES(item.id,CASE WHEN right(path,5)='.webm' THEN 'video' ELSE 'image' END,path,media_role,position) RETURNING id INTO media_id;
   seen=array_append(seen,media_id);
  ELSE
   UPDATE public.product_media SET file_path=path,sort_order=position,media_type=CASE WHEN path IS DISTINCT FROM old.file_path THEN CASE WHEN right(path,5)='.webm' THEN 'video' ELSE 'image' END ELSE media_type END,external_url=CASE WHEN path IS DISTINCT FROM old.file_path THEN NULL ELSE external_url END WHERE id=media_id;
  END IF;
  position=position+1;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.product_media WHERE product_id=item.id AND role IN ('card','main') AND NOT id=ANY(seen)) THEN RAISE EXCEPTION 'Main image cannot be removed'; END IF;
 DELETE FROM public.product_media WHERE product_id=item.id AND role IN ('gallery','detail') AND NOT id=ANY(seen);
 UPDATE public.products SET updated_at=clock_timestamp() WHERE id=item.id RETURNING * INTO item;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'file_path',file_path,'role',role,'sort_order',sort_order) ORDER BY sort_order,id),'[]'::jsonb) INTO rows FROM public.product_media WHERE product_id=item.id;
 RETURN jsonb_build_object('id',item.id,'updated_at',item.updated_at,'media',rows);
END $$;

REVOKE ALL ON FUNCTION
  public.set_product_draft_card(uuid,bigint,bigint,timestamptz,text),
  public.attach_product_draft_image(uuid,bigint,text),
  public.manage_product_gallery(uuid,bigint,timestamptz,text,bigint,text,bigint[]),
  public.save_product_artwork(uuid,bigint,timestamptz,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
  public.set_product_draft_card(uuid,bigint,bigint,timestamptz,text),
  public.attach_product_draft_image(uuid,bigint,text),
  public.manage_product_gallery(uuid,bigint,timestamptz,text,bigint,text,bigint[]),
  public.save_product_artwork(uuid,bigint,timestamptz,jsonb)
  TO service_role;

COMMIT;
