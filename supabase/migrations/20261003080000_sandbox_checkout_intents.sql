BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE public.sandbox_checkout_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  product_id bigint NOT NULL REFERENCES public.products(id),
  price_id text NOT NULL CHECK (price_id = 'pri_01m41bkp4f0fxgb9cfm37n5p4b'),
  amount_cents integer NOT NULL CHECK (amount_cents = 500),
  currency text NOT NULL CHECK (currency = 'EUR'),
  status text NOT NULL DEFAULT 'creating' CHECK (status IN ('creating','ready','unknown','completed','canceled')),
  transaction_id text UNIQUE CHECK (transaction_id ~ '^txn_[a-z0-9]{26}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sandbox_checkout_pending_item ON public.sandbox_checkout_intents(user_id, product_id)
  WHERE status IN ('creating','ready','unknown');
ALTER TABLE public.sandbox_checkout_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sandbox_checkout_intents FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.sandbox_checkout_intents TO service_role;

CREATE FUNCTION public.reserve_sandbox_checkout(p_user_id uuid, p_product_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE intent public.sandbox_checkout_intents%ROWTYPE;
BEGIN
  PERFORM 1 FROM auth.users WHERE id=p_user_id AND email_confirmed_at IS NOT NULL
    AND (banned_until IS NULL OR banned_until<=now()) FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','account_unavailable'); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-ownership:' || p_user_id::text,0));
  PERFORM 1 FROM public.products WHERE id=p_product_id AND id=1 AND slug='qafit01' AND published AND price_eur=5 FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','item_unavailable'); END IF;
  IF EXISTS(SELECT 1 FROM public.entitlements WHERE user_id=p_user_id AND product_id=p_product_id) THEN
    RETURN jsonb_build_object('ok',false,'code','ownership_exists');
  END IF;
  SELECT * INTO intent FROM public.sandbox_checkout_intents WHERE user_id=p_user_id AND product_id=p_product_id
    AND status IN ('creating','ready','unknown') FOR UPDATE;
  IF FOUND THEN RETURN jsonb_build_object('ok',true,'created',false,'intent',to_jsonb(intent)); END IF;
  INSERT INTO public.sandbox_checkout_intents(user_id,product_id,price_id,amount_cents,currency)
    VALUES(p_user_id,p_product_id,'pri_01m41bkp4f0fxgb9cfm37n5p4b',500,'EUR') RETURNING * INTO intent;
  RETURN jsonb_build_object('ok',true,'created',true,'intent',to_jsonb(intent));
END $$;

CREATE FUNCTION public.finish_sandbox_checkout(p_user_id uuid, p_intent_id uuid, p_transaction_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_transaction_id IS NOT NULL AND p_transaction_id !~ '^txn_[a-z0-9]{26}$' THEN RETURN false; END IF;
  UPDATE public.sandbox_checkout_intents SET transaction_id=p_transaction_id,
    status=CASE WHEN p_transaction_id IS NULL THEN 'unknown' ELSE 'ready' END,updated_at=now()
    WHERE id=p_intent_id AND user_id=p_user_id AND status='creating';
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.reserve_sandbox_checkout(uuid,bigint) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finish_sandbox_checkout(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_sandbox_checkout(uuid,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_sandbox_checkout(uuid,uuid,text) TO service_role;
COMMIT;
