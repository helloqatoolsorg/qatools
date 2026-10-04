BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE public.sandbox_product_prices (
  product_id bigint PRIMARY KEY REFERENCES public.products(id),
  price_id text UNIQUE NOT NULL CHECK (price_id ~ '^pri_[a-z0-9]{26}$'),
  paddle_product_id text UNIQUE NOT NULL CHECK (paddle_product_id ~ '^pro_[a-z0-9]{26}$'),
  enabled boolean NOT NULL DEFAULT false
);
INSERT INTO public.sandbox_product_prices VALUES (1,'pri_01m41bkp4f0fxgb9cfm37n5p4b','pro_01m41bf7cprd18e5aebzyp1rzw',true);
ALTER TABLE public.sandbox_product_prices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sandbox_product_prices FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.sandbox_product_prices TO service_role;
ALTER TABLE public.sandbox_checkout_intents DROP CONSTRAINT sandbox_checkout_intents_price_id_check;
ALTER TABLE public.sandbox_checkout_intents DROP CONSTRAINT sandbox_checkout_intents_amount_cents_check;
ALTER TABLE public.sandbox_checkout_intents ADD CHECK (price_id ~ '^pri_[a-z0-9]{26}$'), ADD CHECK (amount_cents BETWEEN 1 AND 99999999);
ALTER TABLE public.sandbox_checkout_intents ADD COLUMN snapshot jsonb;
ALTER TABLE public.sandbox_checkout_intents ADD COLUMN version text NOT NULL DEFAULT 'legacy' CHECK (version IN ('legacy','cart-v1'));
UPDATE public.sandbox_checkout_intents SET snapshot=jsonb_build_array(jsonb_build_object('productId',product_id,'slug','qafit01','priceId',price_id,'paddleProductId','pro_01m41bf7cprd18e5aebzyp1rzw','amount',amount_cents));
CREATE FUNCTION public.fill_legacy_checkout_snapshot() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.snapshot IS NULL AND NEW.version='legacy' AND NEW.product_id=1 AND NEW.amount_cents=500
    AND NEW.price_id='pri_01m41bkp4f0fxgb9cfm37n5p4b' THEN
    NEW.snapshot := jsonb_build_array(jsonb_build_object('productId',NEW.product_id,'slug','qafit01','priceId',NEW.price_id,'paddleProductId','pro_01m41bf7cprd18e5aebzyp1rzw','amount',NEW.amount_cents));
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fill_legacy_checkout_snapshot() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER fill_legacy_checkout_snapshot BEFORE INSERT ON public.sandbox_checkout_intents FOR EACH ROW EXECUTE FUNCTION public.fill_legacy_checkout_snapshot();
ALTER TABLE public.sandbox_checkout_intents ALTER COLUMN snapshot SET NOT NULL;
ALTER TABLE public.sandbox_checkout_intents ADD CHECK (jsonb_typeof(snapshot)='array' AND jsonb_array_length(snapshot) BETWEEN 1 AND 20);
ALTER TABLE public.order_items ADD COLUMN fully_refunded boolean NOT NULL DEFAULT false;
UPDATE public.order_items i SET fully_refunded=true FROM public.orders o WHERE i.order_id=o.id AND o.status='refunded';
ALTER TABLE public.order_items ADD COLUMN provider_item_id text CHECK (provider_item_id ~ '^txnitm_[a-z0-9]{26}$');
CREATE UNIQUE INDEX order_items_provider_item_unique ON public.order_items(order_id,provider_item_id) WHERE provider_item_id IS NOT NULL;

CREATE FUNCTION public.set_sandbox_product_price(p_admin_id uuid,p_product_id bigint,p_expected_price text,p_expected_enabled boolean,p_price_id text,p_paddle_product_id text,p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE prior public.sandbox_product_prices%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=p_admin_id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now()) FOR SHARE OF a,u;
  IF NOT FOUND OR p_price_id IS NULL OR p_price_id !~ '^pri_[a-z0-9]{26}$' OR p_paddle_product_id IS NULL OR p_paddle_product_id !~ '^pro_[a-z0-9]{26}$' OR p_enabled IS NULL THEN RETURN jsonb_build_object('ok',false); END IF;
  PERFORM 1 FROM public.products WHERE id=p_product_id AND (NOT p_enabled OR (published AND price_eur>0 AND price_eur*100=trunc(price_eur*100))) FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-price:'||p_product_id::text,0));
  SELECT * INTO prior FROM public.sandbox_product_prices WHERE product_id=p_product_id FOR UPDATE;
  IF FOUND THEN
    IF prior.price_id IS DISTINCT FROM p_expected_price OR prior.enabled IS DISTINCT FROM p_expected_enabled THEN RETURN jsonb_build_object('ok',false); END IF;
    UPDATE public.sandbox_product_prices SET price_id=p_price_id,paddle_product_id=p_paddle_product_id,enabled=p_enabled WHERE product_id=p_product_id;
  ELSE
    IF p_expected_price IS DISTINCT FROM '' THEN RETURN jsonb_build_object('ok',false); END IF;
    INSERT INTO public.sandbox_product_prices VALUES(p_product_id,p_price_id,p_paddle_product_id,p_enabled);
  END IF;
  RETURN jsonb_build_object('ok',true);
END $$;

CREATE FUNCTION public.reserve_sandbox_cart(p_user_id uuid,p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item jsonb; product public.products%ROWTYPE; price public.sandbox_product_prices%ROWTYPE; expected jsonb := '[]'; total integer := 0; intent public.sandbox_checkout_intents%ROWTYPE;
BEGIN
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 20 THEN RETURN jsonb_build_object('ok',false); END IF;
  PERFORM 1 FROM auth.users WHERE id=p_user_id AND email_confirmed_at IS NOT NULL AND (banned_until IS NULL OR banned_until<=now()) FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','account_unavailable'); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-ownership:'||p_user_id::text,0));
  IF (SELECT count(DISTINCT x->>'productId') FROM jsonb_array_elements(p_items) x)<>jsonb_array_length(p_items) THEN RETURN jsonb_build_object('ok',false); END IF;
  FOR item IN SELECT x FROM jsonb_array_elements(p_items) x ORDER BY (x->>'productId')::bigint LOOP
    SELECT * INTO product FROM public.products WHERE id=(item->>'productId')::bigint AND published AND price_eur>0 AND price_eur*100=trunc(price_eur*100) FOR SHARE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','item_unavailable'); END IF;
    SELECT * INTO price FROM public.sandbox_product_prices WHERE product_id=product.id AND enabled FOR SHARE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','price_unavailable'); END IF;
    IF EXISTS(SELECT 1 FROM public.entitlements WHERE user_id=p_user_id AND product_id=product.id) THEN RETURN jsonb_build_object('ok',false,'code','ownership_exists'); END IF;
    expected := expected || jsonb_build_array(jsonb_build_object('productId',product.id,'slug',product.slug,'priceId',price.price_id,'paddleProductId',price.paddle_product_id,'amount',(product.price_eur*100)::integer));
    total := total + (product.price_eur*100)::integer;
  END LOOP;
  IF total>99999999 OR expected IS DISTINCT FROM p_items THEN RETURN jsonb_build_object('ok',false,'code','price_changed'); END IF;
  SELECT * INTO intent FROM public.sandbox_checkout_intents WHERE user_id=p_user_id AND status IN ('creating','ready','unknown')
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot) held JOIN jsonb_array_elements(expected) wanted ON held->>'productId'=wanted->>'productId') ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    IF intent.version<>'cart-v1' OR intent.snapshot IS DISTINCT FROM expected THEN RETURN jsonb_build_object('ok',false,'code','overlapping_checkout'); END IF;
    RETURN jsonb_build_object('ok',true,'created',false,'intent',to_jsonb(intent));
  END IF;
  INSERT INTO public.sandbox_checkout_intents(user_id,product_id,price_id,amount_cents,currency,snapshot,version)
    VALUES(p_user_id,(expected->0->>'productId')::bigint,expected->0->>'priceId',total,'EUR',expected,'cart-v1') RETURNING * INTO intent;
  RETURN jsonb_build_object('ok',true,'created',true,'intent',to_jsonb(intent));
END $$;
-- Old clients retain their single-item checkout but cannot race an overlapping cart.
ALTER FUNCTION public.reserve_sandbox_checkout(uuid,bigint) RENAME TO reserve_legacy_sandbox_checkout;
REVOKE ALL ON FUNCTION public.reserve_legacy_sandbox_checkout(uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.reserve_sandbox_checkout(p_user_id uuid,p_product_id bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-ownership:'||p_user_id::text,0));
  IF NOT EXISTS(SELECT 1 FROM public.sandbox_product_prices WHERE product_id=p_product_id AND enabled AND price_id='pri_01m41bkp4f0fxgb9cfm37n5p4b' AND paddle_product_id='pro_01m41bf7cprd18e5aebzyp1rzw') THEN RETURN jsonb_build_object('ok',false,'code','price_unavailable'); END IF;
  IF EXISTS(SELECT 1 FROM public.sandbox_checkout_intents WHERE user_id=p_user_id AND version='cart-v1' AND status IN ('creating','ready','unknown') AND EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot) x WHERE (x->>'productId')::bigint=p_product_id)) THEN RETURN jsonb_build_object('ok',false,'code','overlapping_checkout'); END IF;
  RETURN public.reserve_legacy_sandbox_checkout(p_user_id,p_product_id);
END $$;
REVOKE ALL ON FUNCTION public.reserve_sandbox_cart(uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.reserve_sandbox_checkout(uuid,bigint) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.set_sandbox_product_price(uuid,bigint,text,boolean,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_sandbox_cart(uuid,jsonb),public.reserve_sandbox_checkout(uuid,bigint),public.set_sandbox_product_price(uuid,bigint,text,boolean,text,text,boolean) TO service_role;
COMMIT;
