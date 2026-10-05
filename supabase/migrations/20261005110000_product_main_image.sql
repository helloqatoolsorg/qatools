BEGIN;
SET LOCAL lock_timeout='5s';
CREATE FUNCTION public.set_product_draft_card(p_admin_id uuid,p_product_id bigint,p_expected_media_id bigint,p_expected_updated_at timestamptz,p_path text)
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
  IF p_path IS NULL OR p_path !~ ('^drafts/'||p_product_id||'/[0-9a-f-]{36}\.(png|jpg|webp)$') THEN
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
COMMIT;
