-- Transactional counters: rollbacks and ignored conflicting inserts consume no number.
BEGIN;
LOCK TABLE public.orders IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE public.orders ADD COLUMN order_number text UNIQUE;

CREATE TABLE public.order_number_counters (
  scope text PRIMARY KEY CHECK (scope IN ('live', 'sandbox', 'development')),
  last_number bigint NOT NULL DEFAULT 0 CHECK (last_number >= 0)
);
INSERT INTO public.order_number_counters(scope) VALUES ('live'), ('sandbox'), ('development');
ALTER TABLE public.order_number_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_number_counters FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.assign_customer_order_number() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  number_scope text;
  next_number bigint;
  reference text;
BEGIN
  IF NEW.order_number IS NOT NULL OR NEW.status NOT IN ('paid', 'refunded', 'partially_refunded') THEN
    RETURN NULL;
  END IF;
  number_scope := CASE NEW.provider
    WHEN 'paddle' THEN 'live'
    WHEN 'paddle_sandbox' THEN 'sandbox'
    WHEN 'development' THEN 'development'
    ELSE NULL END;
  IF number_scope IS NULL THEN
    RAISE EXCEPTION 'Unsupported order provider for numbering';
  END IF;
  UPDATE public.order_number_counters SET last_number = last_number + 1
    WHERE scope = number_scope RETURNING last_number INTO next_number;
  IF next_number IS NULL THEN RAISE EXCEPTION 'Missing order number counter'; END IF;
  -- Minimum width only: lpad must never truncate numbers above six digits.
  reference := CASE WHEN number_scope = 'live' THEN '' ELSE number_scope || '-' END
    || lpad(next_number::text, greatest(6, length(next_number::text)), '0');
  UPDATE public.orders SET order_number = reference WHERE id = NEW.id;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.assign_customer_order_number() FROM PUBLIC, anon, authenticated, service_role;

-- AFTER triggers run only for rows actually inserted, including ON CONFLICT DO NOTHING.
CREATE TRIGGER assign_customer_order_number
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.assign_customer_order_number();

-- Backfill confirmed history in chronological order without changing database IDs.
DO $$ DECLARE existing record; BEGIN
  FOR existing IN SELECT id FROM public.orders
    WHERE status IN ('paid', 'refunded', 'partially_refunded') ORDER BY created_at, id
  LOOP
    UPDATE public.orders SET status = status WHERE id = existing.id;
  END LOOP;
END $$;

CREATE FUNCTION public.protect_customer_order_number() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'Order history must be retained; use order status instead';
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.order_number IS NOT NULL THEN RAISE EXCEPTION 'Order numbers are assigned automatically'; END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.order_number IS NOT NULL THEN RAISE EXCEPTION 'Numbered orders must be retained'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.order_number IS NOT NULL AND (
    NEW.order_number IS DISTINCT FROM OLD.order_number OR NEW.provider IS DISTINCT FROM OLD.provider
    OR NEW.id IS DISTINCT FROM OLD.id
  ) THEN RAISE EXCEPTION 'An assigned order number and its identity cannot change'; END IF;
  IF OLD.order_number IS NULL AND NEW.order_number IS NOT NULL AND pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'Order numbers are assigned automatically';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_customer_order_number() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER protect_customer_order_number BEFORE INSERT OR UPDATE OR DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.protect_customer_order_number();
CREATE TRIGGER retain_customer_order_history BEFORE TRUNCATE ON public.orders
FOR EACH STATEMENT EXECUTE FUNCTION public.protect_customer_order_number();
COMMIT;
