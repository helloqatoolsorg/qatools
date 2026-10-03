BEGIN;
SET LOCAL lock_timeout = '5s';
-- Trusted admin routes may read order history. Browser access remains under existing RLS.
-- This grants no order/payment/ownership writes and does not alter customer policies.
GRANT SELECT ON TABLE public.orders, public.order_items TO service_role;
COMMIT;
