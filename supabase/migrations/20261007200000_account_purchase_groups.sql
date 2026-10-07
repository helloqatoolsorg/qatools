BEGIN;
SET LOCAL lock_timeout='5s';
-- Read effective access and acquisition origins separately. Never change ownership.
CREATE FUNCTION public.read_account_purchases(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE access_rows jsonb; machines jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id AND email_confirmed_at IS NOT NULL AND (banned_until IS NULL OR banned_until<=now())) THEN RETURN jsonb_build_object('ok',false); END IF;
 SELECT coalesce(jsonb_agg(item ORDER BY acquired DESC,eid DESC),'[]'::jsonb) INTO access_rows FROM (
  SELECT e.id AS eid,coalesce(CASE WHEN e.source='purchase' AND own.active THEN o.provider_created_at END,e.granted_at) AS acquired,
   jsonb_build_object('id',e.id,'status',e.status,'source',e.source,
    'granted_at',coalesce(CASE WHEN e.source='purchase' AND own.active THEN o.provider_created_at END,e.granted_at),
    'direct_acquisition',own.active,
    'products',jsonb_build_object('id',p.id,'name',p.name,'slug',p.slug,'subtitle',p.subtitle,'current_version',p.current_version,'product_type',p.product_type,'category',CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('name',c.name) END),
    'included_tools',coalesce((SELECT jsonb_agg(jsonb_build_object('id',child.id,'name',child.name,'slug',child.slug) ORDER BY child.name,child.id)
      FROM public.entitlement_origins g JOIN public.products child ON child.id=g.tool_id
      JOIN public.entitlements available ON available.product_id=child.id AND available.user_id=p_user_id AND available.status='active'
      WHERE g.root_id=e.id AND g.tool_id<>e.product_id AND g.status='active'),'[]'::jsonb)) AS item
  FROM public.entitlements e JOIN public.products p ON p.id=e.product_id LEFT JOIN public.category c ON c.id=p.category_id
  LEFT JOIN public.order_items i ON i.id=e.order_item_id LEFT JOIN public.orders o ON o.id=i.order_id AND o.user_id=p_user_id
  CROSS JOIN LATERAL (SELECT EXISTS(SELECT 1 FROM public.entitlement_origins g WHERE g.root_id=e.id AND g.tool_id=e.product_id AND g.status='active') AS active) own
  WHERE e.user_id=p_user_id AND e.status='active'
 ) snapshot;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'machine_id',machine_id,'status',status,'activated_at',activated_at) ORDER BY activated_at DESC),'[]'::jsonb)
 INTO machines FROM public.account_activations WHERE user_id=p_user_id;
 RETURN jsonb_build_object('ok',true,'entitlements',access_rows,'machines',machines);
END $$;
REVOKE ALL ON FUNCTION public.read_account_purchases(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_account_purchases(uuid) TO service_role;
COMMIT;
