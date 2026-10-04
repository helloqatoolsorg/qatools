BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION public.read_admin_orders(p_admin_id uuid, p_page integer DEFAULT 1,
  p_status text DEFAULT 'all', p_sort text DEFAULT 'date', p_direction text DEFAULT 'desc')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id
    WHERE a.user_id=p_admin_id AND u.email_confirmed_at IS NOT NULL
      AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501';
  END IF;
  IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 9999 OR p_status IS NULL
    OR p_status NOT IN ('all','pending','paid','refunded','partially_refunded','cancelled')
    OR p_sort IS NULL OR p_sort NOT IN ('number','email','state','price','date')
    OR p_direction IS NULL OR p_direction NOT IN ('asc','desc') THEN
    RAISE EXCEPTION 'Invalid order query' USING ERRCODE='22023';
  END IF;
  WITH ordered AS (
    SELECT o.*, u.email AS customer_email, pr.name AS customer_name,
      row_number() OVER (ORDER BY
        CASE WHEN p_sort='number' AND p_direction='asc' THEN substring(o.order_number FROM '[0-9]+$')::numeric END ASC NULLS LAST,
        CASE WHEN p_sort='number' AND p_direction='desc' THEN substring(o.order_number FROM '[0-9]+$')::numeric END DESC NULLS LAST,
        CASE WHEN p_sort='email' AND p_direction='asc' THEN lower(u.email) END ASC NULLS LAST,
        CASE WHEN p_sort='email' AND p_direction='desc' THEN lower(u.email) END DESC NULLS LAST,
        CASE WHEN p_sort='state' AND p_direction='asc' THEN o.status END ASC,
        CASE WHEN p_sort='state' AND p_direction='desc' THEN o.status END DESC,
        CASE WHEN p_sort='price' AND p_direction='asc' THEN o.currency END ASC,
        CASE WHEN p_sort='price' AND p_direction='desc' THEN o.currency END DESC,
        CASE WHEN p_sort='price' AND p_direction='asc' THEN o.total END ASC,
        CASE WHEN p_sort='price' AND p_direction='desc' THEN o.total END DESC,
        CASE WHEN p_sort='date' AND p_direction='asc' THEN o.created_at END ASC,
        CASE WHEN p_sort='date' AND p_direction='desc' THEN o.created_at END DESC,
        o.id DESC) AS position
    FROM public.orders o LEFT JOIN auth.users u ON u.id=o.user_id
      LEFT JOIN public.profiles pr ON pr.user_id=o.user_id
    WHERE p_status='all' OR o.status=p_status
  ), page AS (
    SELECT * FROM ordered ORDER BY position LIMIT 51 OFFSET (p_page-1)*50
  ), shown AS (
    SELECT * FROM page ORDER BY position LIMIT 50
  )
  SELECT jsonb_build_object('page',p_page,'hasMore',(SELECT count(*)>50 FROM page),
    'orders',coalesce(jsonb_agg(jsonb_build_object(
      'id',s.id,'order_number',s.order_number,'user_id',s.user_id,
      'customerEmail',s.customer_email,'customerName',s.customer_name,
      'provider',s.provider,'provider_order_id',s.provider_order_id,
      'provider_transaction_id',s.provider_transaction_id,'status',s.status,
      'currency',s.currency,'subtotal',s.subtotal,'total',s.total,
      'created_at',s.created_at,'provider_created_at',s.provider_created_at,
      'items',coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id',i.id,'product_id',i.product_id,'quantity',i.quantity,'unit_price',i.unit_price,
        'product',CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('id',p.id,'name',p.name,'slug',p.slug) END
      ) ORDER BY i.id) FROM public.order_items i LEFT JOIN public.products p ON p.id=i.product_id WHERE i.order_id=s.id),'[]'::jsonb)
    ) ORDER BY s.position),'[]'::jsonb)) INTO result FROM shown s;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.read_admin_orders(uuid,integer,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_admin_orders(uuid,integer,text,text,text) TO service_role;
COMMIT;
