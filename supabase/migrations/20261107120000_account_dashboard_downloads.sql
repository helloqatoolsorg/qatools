BEGIN;
SET LOCAL lock_timeout='5s';

-- Keep anonymous totals separate from the customer's private latest download dates.
CREATE TABLE public.account_product_downloads (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id bigint NOT NULL REFERENCES public.products(id),
  last_downloaded_at timestamptz NOT NULL,
  PRIMARY KEY(user_id,product_id)
);
ALTER TABLE public.account_product_downloads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_product_downloads FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.record_product_download(p_request_id uuid,p_user_id uuid,p_product_id bigint,p_file_path text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE acquired_source text;
BEGIN
 IF p_request_id IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id AND email_confirmed_at IS NOT NULL AND (banned_until IS NULL OR banned_until<=now())) THEN RETURN false; END IF;
 SELECT source INTO acquired_source FROM public.entitlements WHERE user_id=p_user_id AND product_id=p_product_id AND status='active' FOR SHARE;
 IF NOT FOUND THEN
  PERFORM 1 FROM public.products WHERE id=p_product_id AND published AND product_type IN ('tool','bundle') FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  acquired_source := 'free'; -- Unpaid download, not a commercial entitlement or trial start.
 END IF;
 PERFORM 1 FROM public.product_downloads WHERE product_id=p_product_id AND enabled AND file_path=p_file_path FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF acquired_source='bundle' THEN
  SELECT CASE WHEN bool_or(r.source='purchase') THEN 'purchase' ELSE 'admin' END INTO acquired_source FROM public.entitlement_origins g JOIN public.entitlements r ON r.id=g.root_id WHERE r.user_id=p_user_id AND g.tool_id=p_product_id AND g.status='active';
 END IF;
 INSERT INTO public.product_download_events(id,product_id,source) VALUES(p_request_id,p_product_id,acquired_source)
 ON CONFLICT(id) DO NOTHING;
 IF FOUND THEN
  INSERT INTO public.account_product_downloads AS history(user_id,product_id,last_downloaded_at)
  VALUES(p_user_id,p_product_id,clock_timestamp())
  ON CONFLICT(user_id,product_id) DO UPDATE
    SET last_downloaded_at=greatest(history.last_downloaded_at,excluded.last_downloaded_at);
 END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.record_product_download(uuid,uuid,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_product_download(uuid,uuid,bigint,text) TO service_role;

CREATE OR REPLACE FUNCTION public.read_account_purchases(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE access_rows jsonb; machines jsonb; downloads jsonb; trial_ends jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id AND email_confirmed_at IS NOT NULL AND (banned_until IS NULL OR banned_until<=now())) THEN RETURN jsonb_build_object('ok',false); END IF;
 SELECT coalesce(jsonb_agg(item ORDER BY acquired DESC,eid DESC),'[]'::jsonb) INTO access_rows FROM (
  SELECT e.id AS eid,coalesce(CASE WHEN e.source='purchase' AND own.active THEN o.provider_created_at END,e.granted_at) AS acquired,
   jsonb_build_object('id',e.id,'status',e.status,'source',e.source,
    'granted_at',coalesce(CASE WHEN e.source='purchase' AND own.active THEN o.provider_created_at END,e.granted_at),
    'direct_acquisition',own.active,
    'products',jsonb_build_object('id',p.id,'name',p.name,'slug',p.slug,'subtitle',p.subtitle,'price_eur',p.price_eur,'published',p.published,'current_version',p.current_version,'product_type',p.product_type,'category',CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('name',c.name) END),
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
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'downloaded_at',d.last_downloaded_at,
   'products',jsonb_build_object('id',p.id,'name',p.name,'slug',p.slug,
     'current_version',p.current_version,'product_type',p.product_type,
     'price_eur',p.price_eur,'published',p.published,
     'category',CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('name',c.name) END)
 ) ORDER BY d.last_downloaded_at DESC,p.id),'[]'::jsonb) INTO downloads
 FROM public.account_product_downloads d
 JOIN public.products p ON p.id=d.product_id
 LEFT JOIN public.category c ON c.id=p.category_id
 WHERE d.user_id=p_user_id;

 SELECT coalesce(jsonb_object_agg(product_id,ends_at),'{}'::jsonb) INTO trial_ends
 FROM public.account_tool_trials WHERE user_id=p_user_id;

 RETURN jsonb_build_object('ok',true,'entitlements',access_rows,'machines',machines,
   'downloads',downloads,'trial_ends',trial_ends);
END $$;
REVOKE ALL ON FUNCTION public.read_account_purchases(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_account_purchases(uuid) TO service_role;

COMMIT;
