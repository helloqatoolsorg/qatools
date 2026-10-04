BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE public.sandbox_catalog_setups (
  product_id bigint PRIMARY KEY REFERENCES public.products(id),
  attempt_id uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id),
  slug text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents BETWEEN 1 AND 99999999),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','product_creating','product_ready','price_creating','price_ready','complete')),
  paddle_product_id text CHECK (paddle_product_id ~ '^pro_[a-z0-9]{26}$'),
  price_id text CHECK (price_id ~ '^pri_[a-z0-9]{26}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sandbox_catalog_setups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sandbox_catalog_setups FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.sandbox_catalog_setups TO service_role;

CREATE FUNCTION public.reserve_sandbox_catalog_setup(p_admin_id uuid,p_product_id bigint,p_slug text,p_amount integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tool public.products%ROWTYPE; job public.sandbox_catalog_setups%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.admin_users a JOIN auth.users u ON a.user_id=u.id WHERE a.user_id=p_admin_id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now()) FOR SHARE OF a,u;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-price:'||p_product_id::text,0));
  SELECT * INTO tool FROM public.products WHERE id=p_product_id AND published AND price_eur>0 FOR SHARE;
  IF NOT FOUND OR tool.slug IS DISTINCT FROM p_slug OR tool.price_eur*100 IS DISTINCT FROM p_amount::numeric OR length(tool.slug) NOT BETWEEN 1 AND 150 THEN RETURN jsonb_build_object('ok',false,'code','tool_changed'); END IF;
  IF EXISTS(SELECT 1 FROM public.sandbox_product_prices WHERE product_id=p_product_id) THEN RETURN jsonb_build_object('ok',false,'code','mapped'); END IF;
  SELECT * INTO job FROM public.sandbox_catalog_setups WHERE product_id=p_product_id FOR UPDATE;
  IF FOUND THEN RETURN jsonb_build_object('ok',true,'created',false,'job',to_jsonb(job)); END IF;
  INSERT INTO public.sandbox_catalog_setups(product_id,admin_id,slug,amount_cents) VALUES(p_product_id,p_admin_id,p_slug,p_amount) RETURNING * INTO job;
  RETURN jsonb_build_object('ok',true,'created',true,'job',to_jsonb(job));
END $$;

CREATE FUNCTION public.advance_sandbox_catalog_setup(p_admin_id uuid,p_attempt_id uuid,p_from text,p_to text,p_paddle_product_id text,p_price_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job public.sandbox_catalog_setups%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.admin_users a JOIN auth.users u ON a.user_id=u.id WHERE a.user_id=p_admin_id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now()) FOR SHARE OF a,u;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO job FROM public.sandbox_catalog_setups WHERE attempt_id=p_attempt_id FOR UPDATE;
  IF NOT FOUND OR job.status IS DISTINCT FROM p_from THEN RETURN false; END IF;
  IF (p_from='reserved' AND p_to='product_creating' AND p_paddle_product_id IS NULL AND p_price_id IS NULL)
    OR (p_from IN ('reserved','product_creating') AND p_to='product_ready' AND p_paddle_product_id ~ '^pro_[a-z0-9]{26}$' AND p_price_id IS NULL)
    OR (p_from='product_ready' AND p_to='price_creating' AND p_paddle_product_id=job.paddle_product_id AND p_price_id IS NULL)
    OR (p_from IN ('product_ready','price_creating') AND p_to='price_ready' AND p_paddle_product_id=job.paddle_product_id AND p_price_id ~ '^pri_[a-z0-9]{26}$') THEN
    UPDATE public.sandbox_catalog_setups SET status=p_to,paddle_product_id=p_paddle_product_id,price_id=p_price_id,updated_at=now() WHERE attempt_id=p_attempt_id;
    RETURN true;
  END IF;
  RETURN false;
END $$;

CREATE FUNCTION public.complete_sandbox_catalog_setup(p_admin_id uuid,p_attempt_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job public.sandbox_catalog_setups%ROWTYPE; saved jsonb;
BEGIN
  PERFORM 1 FROM public.admin_users a JOIN auth.users u ON a.user_id=u.id WHERE a.user_id=p_admin_id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now()) FOR SHARE OF a,u;
  IF NOT FOUND THEN RETURN false; END IF;
  -- Same lock order as reservation and manual mapping; avoid job/price-lock inversion.
  SELECT * INTO job FROM public.sandbox_catalog_setups WHERE attempt_id=p_attempt_id;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-price:'||job.product_id::text,0));
  SELECT * INTO job FROM public.sandbox_catalog_setups WHERE attempt_id=p_attempt_id FOR UPDATE;
  IF job.status IS DISTINCT FROM 'price_ready' THEN RETURN false; END IF;
  PERFORM 1 FROM public.products WHERE id=job.product_id AND published AND slug=job.slug AND price_eur*100=job.amount_cents FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  saved := public.set_sandbox_product_price(p_admin_id,job.product_id,'',false,job.price_id,job.paddle_product_id,true);
  IF saved->>'ok' IS DISTINCT FROM 'true' THEN RETURN false; END IF;
  UPDATE public.sandbox_catalog_setups SET status='complete',updated_at=now() WHERE attempt_id=p_attempt_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.reserve_sandbox_catalog_setup(uuid,bigint,text,integer),public.advance_sandbox_catalog_setup(uuid,uuid,text,text,text,text),public.complete_sandbox_catalog_setup(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_sandbox_catalog_setup(uuid,bigint,text,integer),public.advance_sandbox_catalog_setup(uuid,uuid,text,text,text,text),public.complete_sandbox_catalog_setup(uuid,uuid) TO service_role;
COMMIT;
