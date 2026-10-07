BEGIN;
SET LOCAL lock_timeout='5s';
-- Artwork-only changes: no product identity, price, publication or ownership writes.
CREATE FUNCTION public.manage_product_gallery(p_admin_id uuid,p_product_id bigint,p_expected_updated_at timestamptz,p_action text,p_media_id bigint DEFAULT NULL,p_path text DEFAULT NULL,p_media_ids bigint[] DEFAULT NULL)
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
  IF p_media_ids IS NOT NULL OR p_path IS NULL OR p_path !~ ('^drafts/'||item.id||'/[0-9a-f-]{36}\.(png|jpg|webp|gif)$') OR NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='product-media' AND public) OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='product-media' AND name=p_path) THEN RAISE EXCEPTION 'Invalid gallery image' USING ERRCODE='22023'; END IF;
  IF p_action='add' THEN
   IF (SELECT count(*) FROM public.product_media WHERE product_id=item.id)>=20 THEN RAISE EXCEPTION 'Media limit reached' USING ERRCODE='22023'; END IF;
   INSERT INTO public.product_media(product_id,media_type,file_path,role,sort_order) VALUES(item.id,'image',p_path,'gallery',coalesce((SELECT max(sort_order)+1 FROM public.product_media WHERE product_id=item.id),1));
  ELSE
   UPDATE public.product_media SET media_type='image',file_path=p_path,external_url=NULL WHERE id=selected.id;
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
REVOKE ALL ON FUNCTION public.manage_product_gallery(uuid,bigint,timestamptz,text,bigint,text,bigint[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.manage_product_gallery(uuid,bigint,timestamptz,text,bigint,text,bigint[]) TO service_role;
-- Draft uploads also use the actual row count: gaps or old sort values do not consume image slots.
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
  IF (SELECT count(*) FROM public.product_media WHERE product_id=item.id)>=20 THEN RAISE EXCEPTION 'Media limit reached' USING ERRCODE='22023'; END IF;
  INSERT INTO public.product_media(product_id,media_type,file_path,role,sort_order)
    VALUES(item.id,'image',p_path,CASE WHEN next_order=0 THEN 'card' ELSE 'gallery' END,next_order);
  UPDATE public.products SET updated_at=clock_timestamp() WHERE id=item.id RETURNING * INTO item;
  RETURN jsonb_build_object('id',item.id,'updated_at',item.updated_at);
END $$;
REVOKE ALL ON FUNCTION public.attach_product_draft_image(uuid,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.attach_product_draft_image(uuid,bigint,text) TO service_role;
COMMIT;
