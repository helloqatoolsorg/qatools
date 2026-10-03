BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE FUNCTION public.acquire_free_items(p_user_id uuid, p_product_ids bigint[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result_products jsonb;
BEGIN
  IF p_product_ids IS NULL OR cardinality(p_product_ids) NOT BETWEEN 1 AND 50
    OR EXISTS (SELECT 1 FROM unnest(p_product_ids) AS x(id) WHERE id IS NULL OR id <= 0)
    OR (SELECT count(DISTINCT id) FROM unnest(p_product_ids) AS x(id)) <> cardinality(p_product_ids) THEN
    RETURN jsonb_build_object('ok',false,'code','invalid_items');
  END IF;
  PERFORM 1 FROM auth.users WHERE id=p_user_id AND email_confirmed_at IS NOT NULL
    AND (banned_until IS NULL OR banned_until<=now()) FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','account_unavailable'); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-ownership:' || p_user_id::text,0));
  -- Hold prices/publication stable throughout this acquisition.
  PERFORM 1 FROM public.products WHERE id=ANY(p_product_ids) ORDER BY id FOR SHARE;
  IF (SELECT count(*) FROM public.products WHERE id=ANY(p_product_ids) AND published AND price_eur=0) <> cardinality(p_product_ids) THEN
    RETURN jsonb_build_object('ok',false,'code','not_free');
  END IF;
  PERFORM 1 FROM public.entitlements WHERE user_id=p_user_id AND product_id=ANY(p_product_ids) ORDER BY product_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.entitlements WHERE user_id=p_user_id AND product_id=ANY(p_product_ids) AND status<>'active') THEN
    RETURN jsonb_build_object('ok',false,'code','ownership_inactive');
  END IF;
  INSERT INTO public.entitlements(user_id,product_id,source,status)
    SELECT p_user_id,id,'free','active' FROM public.products WHERE id=ANY(p_product_ids) ORDER BY id
    ON CONFLICT (user_id,product_id) DO NOTHING;
  -- A concurrent privileged insertion must not permit partial success or restoration.
  IF EXISTS (SELECT 1 FROM public.entitlements WHERE user_id=p_user_id AND product_id=ANY(p_product_ids) AND status<>'active') THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='ownership_inactive';
  END IF;
  SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'slug',p.slug) ORDER BY p.id)
    INTO result_products FROM public.products p JOIN public.entitlements e ON e.product_id=p.id
    WHERE e.user_id=p_user_id AND e.status='active' AND p.id=ANY(p_product_ids);
  RETURN jsonb_build_object('ok',true,'products',result_products);
END $$;
REVOKE ALL ON FUNCTION public.acquire_free_items(uuid,bigint[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_free_items(uuid,bigint[]) TO service_role;
COMMIT;
