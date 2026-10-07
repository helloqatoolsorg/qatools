BEGIN;
SET LOCAL lock_timeout = '5s';

-- Rolling UTC ranges: 30 days / 3 calendar months daily; 6 / 12 calendar months weekly.
-- Final weekly bucket may be partial. The legacy week input remains for old deployments only.
-- Reporting only. Never mutate orders, items, events or commercial ownership.
CREATE OR REPLACE FUNCTION public.read_admin_finance(p_admin_id uuid, p_environment text DEFAULT 'sandbox', p_period text DEFAULT 'month')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  today date := (now() AT TIME ZONE 'UTC')::date;
  month_start date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
  start_date date;
  step interval;
  result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id
    WHERE a.user_id=p_admin_id AND u.email_confirmed_at IS NOT NULL
      AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501';
  END IF;
  IF p_environment IS NULL OR p_environment NOT IN ('sandbox','live')
    OR p_period IS NULL OR p_period NOT IN ('week','month','3months','6months','year') THEN
    RAISE EXCEPTION 'Invalid finance query' USING ERRCODE='22023';
  END IF;
  start_date := CASE p_period WHEN 'week' THEN today-6 WHEN 'month' THEN today-29
    WHEN '3months' THEN (today-interval '3 months')::date+1
    WHEN '6months' THEN (today-interval '6 months')::date+1
    ELSE (today-interval '12 months')::date+1 END;
  step := CASE WHEN p_period IN ('week','month','3months') THEN interval '1 day' ELSE interval '7 days' END;
  WITH source AS (
    SELECT o.id,o.currency,o.status,o.total,
      (coalesce(o.provider_created_at,o.created_at) AT TIME ZONE 'UTC')::date AS sale_date,
      coalesce((SELECT sum(i.unit_price*i.quantity) FROM public.order_items i
        WHERE i.order_id=o.id AND i.fully_refunded),0) AS item_refunds
    FROM public.orders o
    WHERE o.provider=CASE p_environment WHEN 'sandbox' THEN 'paddle_sandbox' ELSE 'paddle' END
      AND o.status IN ('paid','refunded','partially_refunded')
      AND coalesce(o.provider_created_at,o.created_at)<=now()
  ), sales AS (
    SELECT *, CASE WHEN status='refunded' THEN total WHEN status='partially_refunded'
      THEN least(greatest(item_refunds,0),greatest(total,0)) ELSE 0 END AS refunds,
      total<0 OR (status='partially_refunded' AND (item_refunds<=0 OR item_refunds>=total))
        OR (status='paid' AND item_refunds<>0) AS needs_review
    FROM source
  ), currencies AS (SELECT DISTINCT currency FROM sales),
  totals AS (
    SELECT currency,count(*) AS orders, sum(total) AS payments,sum(refunds) AS refunds,
      sum(total-refunds) AS remaining,
      count(*) FILTER (WHERE refunds>0) AS refunded_orders,
      count(*) FILTER (WHERE needs_review) AS review_orders,
      coalesce(sum(total) FILTER (WHERE sale_date>=month_start),0) AS month_payments,
      coalesce(sum(refunds) FILTER (WHERE sale_date>=month_start),0) AS month_refunds,
      coalesce(sum(total-refunds) FILTER (WHERE sale_date>=month_start),0) AS month_remaining,
      coalesce(sum(total-refunds) FILTER (WHERE sale_date>=today-29),0) AS last30_remaining,
      count(*) FILTER (WHERE sale_date>=start_date) AS period_orders,
      coalesce(sum(total) FILTER (WHERE sale_date>=start_date),0) AS period_payments,
      coalesce(sum(refunds) FILTER (WHERE sale_date>=start_date),0) AS period_refunds,
      coalesce(sum(total-refunds) FILTER (WHERE sale_date>=start_date),0) AS period_remaining
    FROM sales GROUP BY currency
  ), buckets AS (
    SELECT c.currency,g::date AS bucket_date FROM currencies c
      CROSS JOIN generate_series(start_date::timestamp,today::timestamp,step) g
  ), points AS (
    SELECT b.currency,b.bucket_date,count(s.id) AS orders,
      coalesce(sum(s.total),0) AS payments,coalesce(sum(s.refunds),0) AS refunds,
      coalesce(sum(s.total-s.refunds),0) AS remaining
    FROM buckets b LEFT JOIN sales s ON s.currency=b.currency AND s.sale_date>=b.bucket_date
      AND s.sale_date<(b.bucket_date+step)::date
    GROUP BY b.currency,b.bucket_date
  )
  SELECT jsonb_build_object('environment',p_environment,'period',p_period,'timezone','UTC',
    'generatedAt',now(),'startDate',start_date,'endDate',today,
    'currencies',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'currency',t.currency,'orders',t.orders,'payments',t.payments,'refunds',t.refunds,'remaining',t.remaining,
      'refundedOrders',t.refunded_orders,'reviewOrders',t.review_orders,
      'last30DaysRemaining',t.last30_remaining,'monthPayments',t.month_payments,'monthRefunds',t.month_refunds,'monthRemaining',t.month_remaining,
      'periodOrders',t.period_orders,'periodPayments',t.period_payments,'periodRefunds',t.period_refunds,'periodRemaining',t.period_remaining,
      'points',(SELECT jsonb_agg(jsonb_build_object('date',p.bucket_date,'endDate',least((p.bucket_date+step)::date-1,today),'orders',p.orders,
        'payments',p.payments,'refunds',p.refunds,'remaining',p.remaining) ORDER BY p.bucket_date)
        FROM points p WHERE p.currency=t.currency)) ORDER BY t.currency) FROM totals t),'[]'::jsonb)) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.read_admin_finance(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_admin_finance(uuid,text,text) TO service_role;
COMMIT;
