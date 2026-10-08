-- Separate live ledgers; sandbox data and price mappings remain in place.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE public.live_product_prices (LIKE public.sandbox_product_prices INCLUDING ALL);
ALTER TABLE public.live_product_prices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.live_product_prices FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.live_product_prices TO service_role;
CREATE TABLE public.live_catalog_setups (LIKE public.sandbox_catalog_setups INCLUDING ALL);
ALTER TABLE public.live_catalog_setups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.live_catalog_setups FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.live_catalog_setups TO service_role;
CREATE TABLE public.live_checkout_intents (LIKE public.sandbox_checkout_intents INCLUDING ALL);
ALTER TABLE public.live_checkout_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.live_checkout_intents FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.live_checkout_intents TO service_role;
CREATE TABLE public.live_payment_events (LIKE public.sandbox_payment_events INCLUDING ALL);
ALTER TABLE public.live_payment_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.live_payment_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.live_payment_events TO service_role;
ALTER TABLE public.live_product_prices ADD FOREIGN KEY(product_id) REFERENCES public.products(id);
ALTER TABLE public.live_catalog_setups ADD FOREIGN KEY(product_id) REFERENCES public.products(id), ADD FOREIGN KEY(admin_id) REFERENCES auth.users(id);
ALTER TABLE public.live_checkout_intents ADD FOREIGN KEY(user_id) REFERENCES auth.users(id), ADD FOREIGN KEY(product_id) REFERENCES public.products(id), ADD CONSTRAINT live_cart_only CHECK(version='cart-v1');
ALTER TABLE public.live_checkout_intents ALTER COLUMN version SET DEFAULT 'cart-v1';
DROP INDEX IF EXISTS public.orders_provider_transaction_id_unique;
CREATE UNIQUE INDEX orders_provider_transaction_id_unique ON public.orders(provider,provider_transaction_id) WHERE provider_transaction_id IS NOT NULL;

-- Based on 20261005120000_product_publication_workflow.sql: set_sandbox_product_price; environment-specific references only.
CREATE OR REPLACE FUNCTION public.set_live_product_price(p_admin_id uuid,p_product_id bigint,p_expected_price text,p_expected_enabled boolean,p_price_id text,p_paddle_product_id text,p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE prior public.live_product_prices%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=p_admin_id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now()) FOR SHARE OF a,u;
  IF NOT FOUND OR p_price_id IS NULL OR p_price_id !~ '^pri_[a-z0-9]{26}$' OR p_paddle_product_id IS NULL OR p_paddle_product_id !~ '^pro_[a-z0-9]{26}$' OR p_enabled IS NULL THEN RETURN jsonb_build_object('ok',false); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-price:'||p_product_id::text,0));
  PERFORM 1 FROM public.products WHERE id=p_product_id AND (NOT p_enabled OR (price_eur>0 AND price_eur*100=trunc(price_eur*100))) FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false); END IF;
  SELECT * INTO prior FROM public.live_product_prices WHERE product_id=p_product_id FOR UPDATE;
  IF FOUND THEN
    IF prior.price_id IS DISTINCT FROM p_expected_price OR prior.enabled IS DISTINCT FROM p_expected_enabled THEN RETURN jsonb_build_object('ok',false); END IF;
    UPDATE public.live_product_prices SET price_id=p_price_id,paddle_product_id=p_paddle_product_id,enabled=p_enabled WHERE product_id=p_product_id;
  ELSE
    IF p_expected_price IS DISTINCT FROM '' THEN RETURN jsonb_build_object('ok',false); END IF;
    INSERT INTO public.live_product_prices VALUES(p_product_id,p_price_id,p_paddle_product_id,p_enabled);
  END IF;
  RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.set_live_product_price(uuid,bigint,text,boolean,text,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.set_live_product_price(uuid,bigint,text,boolean,text,text,boolean) TO service_role;

-- Based on 20261005120000_product_publication_workflow.sql: reserve_sandbox_catalog_setup; environment-specific references only.
CREATE OR REPLACE FUNCTION public.reserve_live_catalog_setup(p_admin_id uuid,p_product_id bigint,p_slug text,p_amount integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tool public.products%ROWTYPE; job public.live_catalog_setups%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.admin_users a JOIN auth.users u ON a.user_id=u.id WHERE a.user_id=p_admin_id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now()) FOR SHARE OF a,u;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-price:'||p_product_id::text,0));
  SELECT * INTO tool FROM public.products WHERE id=p_product_id AND price_eur>0 FOR SHARE;
  IF NOT FOUND OR tool.slug IS DISTINCT FROM p_slug OR tool.price_eur*100 IS DISTINCT FROM p_amount::numeric OR length(tool.slug) NOT BETWEEN 1 AND 150 THEN RETURN jsonb_build_object('ok',false,'code','tool_changed'); END IF;
  IF EXISTS(SELECT 1 FROM public.live_product_prices WHERE product_id=p_product_id) THEN RETURN jsonb_build_object('ok',false,'code','mapped'); END IF;
  SELECT * INTO job FROM public.live_catalog_setups WHERE product_id=p_product_id FOR UPDATE;
  IF FOUND THEN RETURN jsonb_build_object('ok',true,'created',false,'job',to_jsonb(job)); END IF;
  INSERT INTO public.live_catalog_setups(product_id,admin_id,slug,amount_cents) VALUES(p_product_id,p_admin_id,p_slug,p_amount) RETURNING * INTO job;
  RETURN jsonb_build_object('ok',true,'created',true,'job',to_jsonb(job));
END $$;
REVOKE ALL ON FUNCTION public.reserve_live_catalog_setup(uuid,bigint,text,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.reserve_live_catalog_setup(uuid,bigint,text,integer) TO service_role;

-- Based on 20261004190000_admin_paddle_catalog_setup.sql: advance_sandbox_catalog_setup; environment-specific references only.
CREATE FUNCTION public.advance_live_catalog_setup(p_admin_id uuid,p_attempt_id uuid,p_from text,p_to text,p_paddle_product_id text,p_price_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job public.live_catalog_setups%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.admin_users a JOIN auth.users u ON a.user_id=u.id WHERE a.user_id=p_admin_id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now()) FOR SHARE OF a,u;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO job FROM public.live_catalog_setups WHERE attempt_id=p_attempt_id FOR UPDATE;
  IF NOT FOUND OR job.status IS DISTINCT FROM p_from THEN RETURN false; END IF;
  IF (p_from='reserved' AND p_to='product_creating' AND p_paddle_product_id IS NULL AND p_price_id IS NULL)
    OR (p_from IN ('reserved','product_creating') AND p_to='product_ready' AND p_paddle_product_id ~ '^pro_[a-z0-9]{26}$' AND p_price_id IS NULL)
    OR (p_from='product_ready' AND p_to='price_creating' AND p_paddle_product_id=job.paddle_product_id AND p_price_id IS NULL)
    OR (p_from IN ('product_ready','price_creating') AND p_to='price_ready' AND p_paddle_product_id=job.paddle_product_id AND p_price_id ~ '^pri_[a-z0-9]{26}$') THEN
    UPDATE public.live_catalog_setups SET status=p_to,paddle_product_id=p_paddle_product_id,price_id=p_price_id,updated_at=now() WHERE attempt_id=p_attempt_id;
    RETURN true;
  END IF;
  RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.advance_live_catalog_setup(uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.advance_live_catalog_setup(uuid,uuid,text,text,text,text) TO service_role;

-- Based on 20261005120000_product_publication_workflow.sql: complete_sandbox_catalog_setup; environment-specific references only.
CREATE OR REPLACE FUNCTION public.complete_live_catalog_setup(p_admin_id uuid,p_attempt_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job public.live_catalog_setups%ROWTYPE; saved jsonb;
BEGIN
  PERFORM 1 FROM public.admin_users a JOIN auth.users u ON a.user_id=u.id WHERE a.user_id=p_admin_id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now()) FOR SHARE OF a,u;
  IF NOT FOUND THEN RETURN false; END IF;
  -- Same lock order as reservation and manual mapping; avoid job/price-lock inversion.
  SELECT * INTO job FROM public.live_catalog_setups WHERE attempt_id=p_attempt_id;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-price:'||job.product_id::text,0));
  SELECT * INTO job FROM public.live_catalog_setups WHERE attempt_id=p_attempt_id FOR UPDATE;
  IF job.status IS DISTINCT FROM 'price_ready' THEN RETURN false; END IF;
  PERFORM 1 FROM public.products WHERE id=job.product_id AND slug=job.slug AND price_eur*100=job.amount_cents FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  saved := public.set_live_product_price(p_admin_id,job.product_id,'',false,job.price_id,job.paddle_product_id,true);
  IF saved->>'ok' IS DISTINCT FROM 'true' THEN RETURN false; END IF;
  UPDATE public.live_catalog_setups SET status='complete',updated_at=now() WHERE attempt_id=p_attempt_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.complete_live_catalog_setup(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.complete_live_catalog_setup(uuid,uuid) TO service_role;

-- Based on 20261005160000_refunded_product_repurchase.sql: reserve_sandbox_cart_base; environment-specific references only.
CREATE OR REPLACE FUNCTION public.reserve_live_cart_base(p_user_id uuid,p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item jsonb; product public.products%ROWTYPE; price public.live_product_prices%ROWTYPE; expected jsonb := '[]'; total integer := 0; intent public.live_checkout_intents%ROWTYPE;
BEGIN
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 20 THEN RETURN jsonb_build_object('ok',false); END IF;
  PERFORM 1 FROM auth.users WHERE id=p_user_id AND email_confirmed_at IS NOT NULL AND (banned_until IS NULL OR banned_until<=now()) FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','account_unavailable'); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-ownership:'||p_user_id::text,0));
  IF (SELECT count(DISTINCT x->>'productId') FROM jsonb_array_elements(p_items) x)<>jsonb_array_length(p_items) THEN RETURN jsonb_build_object('ok',false); END IF;
  FOR item IN SELECT x FROM jsonb_array_elements(p_items) x ORDER BY (x->>'productId')::bigint LOOP
    SELECT * INTO product FROM public.products WHERE id=(item->>'productId')::bigint AND published AND price_eur>0 AND price_eur*100=trunc(price_eur*100) FOR SHARE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','item_unavailable'); END IF;
    SELECT * INTO price FROM public.live_product_prices WHERE product_id=product.id AND enabled FOR SHARE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','price_unavailable'); END IF;
    IF EXISTS(SELECT 1 FROM public.entitlements WHERE user_id=p_user_id AND product_id=product.id AND status<>'refunded') THEN RETURN jsonb_build_object('ok',false,'code','ownership_exists'); END IF;
    expected := expected || jsonb_build_array(jsonb_build_object('productId',product.id,'slug',product.slug,'priceId',price.price_id,'paddleProductId',price.paddle_product_id,'amount',(product.price_eur*100)::integer));
    total := total + (product.price_eur*100)::integer;
  END LOOP;
  IF total>99999999 OR expected IS DISTINCT FROM p_items THEN RETURN jsonb_build_object('ok',false,'code','price_changed'); END IF;
  SELECT * INTO intent FROM public.live_checkout_intents WHERE user_id=p_user_id AND status IN ('creating','ready','unknown')
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot) held JOIN jsonb_array_elements(expected) wanted ON held->>'productId'=wanted->>'productId') ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    IF intent.version<>'cart-v1' OR intent.snapshot IS DISTINCT FROM expected THEN RETURN jsonb_build_object('ok',false,'code','overlapping_checkout'); END IF;
    RETURN jsonb_build_object('ok',true,'created',false,'intent',to_jsonb(intent));
  END IF;
  INSERT INTO public.live_checkout_intents(user_id,product_id,price_id,amount_cents,currency,snapshot,version)
    VALUES(p_user_id,(expected->0->>'productId')::bigint,expected->0->>'priceId',total,'EUR',expected,'cart-v1') RETURNING * INTO intent;
  RETURN jsonb_build_object('ok',true,'created',true,'intent',to_jsonb(intent));
END $$;
REVOKE ALL ON FUNCTION public.reserve_live_cart_base(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- Based on 20261007230000_project_delivery.sql: reserve_sandbox_cart; environment-specific references only.
CREATE OR REPLACE FUNCTION public.reserve_live_cart(p_user_id uuid,p_items jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; line jsonb; item public.products; release public.bundle_releases; pinned jsonb:='{}';
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-ownership:'||p_user_id::text,0));
 IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN RETURN jsonb_build_object('ok',false); END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  SELECT * INTO item FROM public.products WHERE id=(line->>'productId')::bigint FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','unsupported_product'); END IF;
  IF item.product_type IN ('bundle','project') THEN
   SELECT * INTO release FROM public.bundle_releases WHERE product_id=item.id;
   IF NOT FOUND OR (item.product_type='project' AND release.project_sha256 IS NULL) OR NOT EXISTS(SELECT 1 FROM public.product_downloads WHERE product_id=item.id AND enabled AND file_path=release.file_path)
    OR release.tool_ids IS DISTINCT FROM (SELECT array_agg(tool_id ORDER BY tool_id) FROM public.product_members WHERE product_id=item.id)
    THEN RETURN jsonb_build_object('ok',false,'code','bundle_not_ready'); END IF;
   IF EXISTS(SELECT 1 FROM public.entitlements WHERE user_id=p_user_id AND product_id=ANY(release.tool_ids) AND status='revoked') THEN RETURN jsonb_build_object('ok',false,'code','revoked_access'); END IF;
   pinned:=pinned||jsonb_build_object(item.id::text,to_jsonb(release.tool_ids));
  END IF;
 END LOOP;
 result:=public.reserve_live_cart_base(p_user_id,p_items);
 IF result->>'created'='true' THEN UPDATE public.live_checkout_intents SET bundle_members=pinned WHERE id=(result->'intent'->>'id')::uuid; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.reserve_live_cart(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.reserve_live_cart(uuid,jsonb) TO service_role;

-- Based on 20261003080000_sandbox_checkout_intents.sql: finish_sandbox_checkout; environment-specific references only.
CREATE FUNCTION public.finish_live_checkout(p_user_id uuid, p_intent_id uuid, p_transaction_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_transaction_id IS NOT NULL AND p_transaction_id !~ '^txn_[a-z0-9]{26}$' THEN RETURN false; END IF;
  UPDATE public.live_checkout_intents SET transaction_id=p_transaction_id,
    status=CASE WHEN p_transaction_id IS NULL THEN 'unknown' ELSE 'ready' END,updated_at=now()
    WHERE id=p_intent_id AND user_id=p_user_id AND status='creating';
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.finish_live_checkout(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.finish_live_checkout(uuid,uuid,text) TO service_role;

-- Based on 20261005160000_refunded_product_repurchase.sql: process_cart_sandbox_payment_event; environment-specific references only.
CREATE OR REPLACE FUNCTION public.process_cart_live_payment_event(p_event jsonb,p_body_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE eid text := p_event->>'eventId'; etype text := p_event->>'type'; txn text := p_event->>'txnId'; digest text := p_event->>'eventHash'; occurred timestamptz;
  prior public.live_payment_events%ROWTYPE; intent public.live_checkout_intents%ROWTYPE; purchase public.orders%ROWTYPE; order_item public.order_items%ROWTYPE;
  result text := 'ignored'; expected jsonb; actual jsonb; refunded jsonb; valid boolean; oid bigint; iid bigint;
BEGIN
  IF p_event->>'environment' IS DISTINCT FROM 'live' THEN RETURN jsonb_build_object('ok',false); END IF;
  IF eid IS NULL OR eid !~ '^(evt|ntfsimevt)_[a-z0-9]{26}$' OR p_body_hash IS NULL OR p_body_hash !~ '^[a-f0-9]{64}$' OR digest IS NULL OR digest !~ '^[a-f0-9]{64}$'
    OR etype IS NULL OR etype !~ '^[a-z_]+\.[a-z_]+$' OR length(etype)>80 OR (txn IS NOT NULL AND txn !~ '^txn_[a-z0-9]{26}$') THEN RETURN jsonb_build_object('ok',false); END IF;
  occurred := (p_event->>'occurredAt')::timestamptz;
  IF occurred IS NULL THEN RETURN jsonb_build_object('ok',false); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-paddle-event:'||eid,0));
  SELECT * INTO prior FROM public.live_payment_events WHERE event_id=eid;
  IF FOUND THEN
    IF prior.event_type IS DISTINCT FROM etype OR prior.transaction_id IS DISTINCT FROM txn OR prior.occurred_at IS DISTINCT FROM occurred OR prior.event_hash IS DISTINCT FROM digest THEN RETURN jsonb_build_object('ok',false); END IF;
    IF prior.outcome<>'review' OR (p_event->>'fullRefund' IS DISTINCT FROM 'true' AND p_event->>'refundedTools' IS DISTINCT FROM 'true') THEN RETURN jsonb_build_object('ok',true,'outcome',prior.outcome); END IF;
  END IF;
  IF txn IS NOT NULL THEN PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-paddle-transaction:'||txn,0)); END IF;
  IF eid LIKE 'ntfsimevt_%' THEN txn := NULL;
  ELSIF etype='transaction.completed' THEN
    result := 'review';
    IF p_event->>'valid'='true' AND txn IS NOT NULL AND p_event->>'intentId' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' THEN
      SELECT * INTO intent FROM public.live_checkout_intents WHERE id=(p_event->>'intentId')::uuid AND version='cart-v1';
      IF FOUND THEN
        PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-ownership:'||intent.user_id::text,0));
        SELECT * INTO intent FROM public.live_checkout_intents WHERE id=intent.id FOR UPDATE;
        IF intent.status IN ('creating','unknown') AND intent.transaction_id IS NULL THEN RETURN jsonb_build_object('ok',false,'outcome','retry_binding'); END IF;
        valid := intent.transaction_id=txn AND intent.currency='EUR' AND (p_event->>'total')::integer BETWEEN 1 AND intent.amount_cents
          AND (intent.charged_amount_cents IS NULL OR intent.charged_amount_cents=(p_event->>'total')::integer)
          AND (intent.amount_cents=(p_event->>'total')::integer OR (p_event->>'taxAdjusted'='true' AND p_event->>'subtotal'=p_event->>'total'))
          AND (p_event->>'subtotal')::integer BETWEEN 0 AND (p_event->>'total')::integer
          AND jsonb_typeof(p_event->'items')='array' AND jsonb_array_length(p_event->'items')=jsonb_array_length(intent.snapshot)
          AND (SELECT count(DISTINCT x->>'providerItemId') FROM jsonb_array_elements(p_event->'items') x)=jsonb_array_length(intent.snapshot);
        IF valid THEN
          valid := (SELECT sum(COALESCE(x->>'chargedAmount',x->>'amount')::integer) FROM jsonb_array_elements(p_event->'items') x)=(p_event->>'total')::integer;
          FOR expected IN SELECT x FROM jsonb_array_elements(intent.snapshot) x LOOP
            SELECT x INTO actual FROM jsonb_array_elements(p_event->'items') x WHERE x->>'priceId'=expected->>'priceId';
            IF NOT FOUND OR actual->>'paddleProductId' IS DISTINCT FROM expected->>'paddleProductId' OR actual->>'amount' IS DISTINCT FROM expected->>'amount' OR COALESCE(actual->>'chargedAmount',actual->>'amount') !~ '^[1-9][0-9]{0,8}$' OR COALESCE(actual->>'chargedAmount',actual->>'amount')::integer NOT BETWEEN 1 AND (expected->>'amount')::integer OR actual->>'providerItemId' IS NULL OR actual->>'providerItemId' !~ '^txnitm_[a-z0-9]{26}$' THEN valid:=false; EXIT; END IF;
          END LOOP;
        END IF;
        IF valid AND NOT EXISTS(SELECT 1 FROM public.live_payment_events WHERE transaction_id=txn AND outcome IN ('review','refunded')) THEN
          IF intent.status='completed' THEN result := 'duplicate';
          ELSIF intent.status='ready' THEN
            PERFORM 1 FROM auth.users WHERE id=intent.user_id AND email_confirmed_at IS NOT NULL AND (banned_until IS NULL OR banned_until<=now()) FOR SHARE;
            IF FOUND AND NOT EXISTS(SELECT 1 FROM public.entitlements e JOIN jsonb_array_elements(intent.snapshot) s ON e.product_id=(s->>'productId')::bigint WHERE e.user_id=intent.user_id AND e.status<>'refunded')
              AND NOT EXISTS(SELECT 1 FROM public.orders WHERE provider='paddle' AND provider_transaction_id=txn) THEN
              INSERT INTO public.orders(user_id,provider,provider_transaction_id,status,currency,subtotal,total,provider_created_at)
                VALUES(intent.user_id,'paddle',txn,'paid','EUR',(p_event->>'subtotal')::numeric/100,(p_event->>'total')::numeric/100,occurred) RETURNING id INTO oid;
              FOR expected IN SELECT x FROM jsonb_array_elements(intent.snapshot) x LOOP
                SELECT x INTO actual FROM jsonb_array_elements(p_event->'items') x WHERE x->>'priceId'=expected->>'priceId';
                INSERT INTO public.order_items(order_id,product_id,quantity,unit_price,provider_item_id)
                  VALUES(oid,(expected->>'productId')::bigint,1,COALESCE(actual->>'chargedAmount',actual->>'amount')::numeric/100,actual->>'providerItemId') RETURNING id INTO iid;
                INSERT INTO public.entitlements(user_id,product_id,order_item_id,source,status) VALUES(intent.user_id,(expected->>'productId')::bigint,iid,'purchase','active') ON CONFLICT(user_id,product_id) DO UPDATE SET order_item_id=excluded.order_item_id,source='purchase',status='active' WHERE entitlements.status='refunded' OR (entitlements.source='bundle' AND entitlements.status='active');
              IF NOT FOUND THEN RAISE EXCEPTION 'Ownership changed' USING ERRCODE='40001'; END IF;
              END LOOP;
              UPDATE public.live_checkout_intents SET status='completed',charged_amount_cents=(p_event->>'total')::integer,updated_at=now() WHERE id=intent.id;
              result := 'fulfilled';
            END IF;
          END IF;
        END IF;
      END IF;
    END IF;
  ELSIF etype LIKE 'adjustment.%' OR etype='transaction.canceled' THEN
    result := 'review';
    IF etype IN ('adjustment.created','adjustment.updated') AND txn IS NOT NULL AND p_event->>'refundId' ~ '^adj_[a-z0-9]{26}$'
      AND p_event->>'refundTotal' ~ '^[1-9][0-9]{0,8}$' AND (p_event->>'fullRefund'='true' OR p_event->>'refundedTools'='true') THEN
      SELECT * INTO intent FROM public.live_checkout_intents WHERE transaction_id=txn AND version='cart-v1';
      IF FOUND THEN
        PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-ownership:'||intent.user_id::text,0));
        SELECT * INTO intent FROM public.live_checkout_intents WHERE id=intent.id FOR UPDATE;
        SELECT * INTO purchase FROM public.orders WHERE provider='paddle' AND provider_transaction_id=txn AND user_id=intent.user_id FOR UPDATE;
        IF FOUND AND intent.status='completed' AND purchase.status IN ('paid','partially_refunded','refunded') AND purchase.currency='EUR' AND purchase.total*100=COALESCE(intent.charged_amount_cents,intent.amount_cents) THEN
          valid := (SELECT count(*) FROM public.order_items WHERE order_id=purchase.id)=jsonb_array_length(intent.snapshot);
          -- A whole-order refund without item detail must cover the exact original total.
          IF p_event->>'refundedTools'='true' THEN
            refunded := p_event->'refundItems';
            valid := valid AND jsonb_typeof(refunded)='array' AND jsonb_array_length(refunded) BETWEEN 1 AND jsonb_array_length(intent.snapshot)
              AND (SELECT count(DISTINCT x->>'providerItemId') FROM jsonb_array_elements(refunded) x)=jsonb_array_length(refunded)
              AND (SELECT sum((x->>'amount')::integer) FROM jsonb_array_elements(refunded) x)=(p_event->>'refundTotal')::integer;
          ELSE
            valid := valid AND purchase.total*100=(p_event->>'refundTotal')::integer;
            SELECT jsonb_agg(jsonb_build_object('providerItemId',provider_item_id,'amount',(unit_price*100)::integer)) INTO refunded FROM public.order_items WHERE order_id=purchase.id;
          END IF;
          IF valid THEN
            FOR actual IN SELECT x FROM jsonb_array_elements(refunded) x LOOP
              SELECT * INTO order_item FROM public.order_items WHERE order_id=purchase.id AND provider_item_id=actual->>'providerItemId' FOR UPDATE;
              IF NOT FOUND OR order_item.quantity<>1 OR order_item.unit_price*100<>(actual->>'amount')::integer THEN valid:=false; EXIT; END IF;
              SELECT x INTO expected FROM jsonb_array_elements(intent.snapshot) x WHERE (x->>'productId')::bigint=order_item.product_id;
              IF NOT FOUND OR (expected->>'amount')::integer<(actual->>'amount')::integer THEN valid:=false; EXIT; END IF;
              PERFORM 1 FROM public.entitlements WHERE user_id=purchase.user_id AND product_id=order_item.product_id AND order_item_id=order_item.id AND source='purchase' AND status IN ('active','refunded','revoked') FOR UPDATE;
              IF NOT FOUND AND NOT order_item.fully_refunded THEN valid:=false; EXIT; END IF;
            END LOOP;
          END IF;
          IF valid THEN
            -- Process each purchase root separately: its projection can touch another tool
            -- in the same cart. A bulk UPDATE would risk PostgreSQL tuple conflicts.
            FOR actual IN SELECT x FROM jsonb_array_elements(refunded) x LOOP
              UPDATE public.entitlements e SET status='refunded' FROM public.order_items i
                WHERE i.order_id=purchase.id AND i.provider_item_id=actual->>'providerItemId' AND e.user_id=purchase.user_id AND e.product_id=i.product_id AND e.order_item_id=i.id AND e.source='purchase' AND e.status='active';
            END LOOP;
            UPDATE public.order_items i SET fully_refunded=true FROM jsonb_array_elements(refunded) r WHERE i.order_id=purchase.id AND i.provider_item_id=r->>'providerItemId';
            -- Financial refund coverage is independent of prior admin entitlement revocation.
            UPDATE public.orders SET status=CASE WHEN EXISTS(SELECT 1 FROM public.order_items WHERE order_id=purchase.id AND NOT fully_refunded) THEN 'partially_refunded' ELSE 'refunded' END WHERE id=purchase.id;
            result := 'refunded';
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;
  INSERT INTO public.live_payment_events(event_id,body_hash,event_type,transaction_id,outcome,occurred_at,event_hash)
    VALUES(eid,p_body_hash,etype,txn,result,occurred,digest)
    ON CONFLICT(event_id) DO UPDATE SET outcome=EXCLUDED.outcome,event_hash=COALESCE(live_payment_events.event_hash,EXCLUDED.event_hash);
  RETURN jsonb_build_object('ok',true,'outcome',result);
END $$;
REVOKE ALL ON FUNCTION public.process_cart_live_payment_event(jsonb,text) FROM PUBLIC,anon,authenticated,service_role;

-- Based on 20261007230000_project_delivery.sql: product_publication_checks; environment-specific references only.
CREATE OR REPLACE FUNCTION public.live_product_publication_checks(p_admin_id uuid,p_product_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.products; missing text[]:='{}';
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=p_admin_id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
 SELECT * INTO item FROM public.products WHERE id=p_product_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Product not found' USING ERRCODE='22023'; END IF;
 IF item.product_type IN ('bundle','project') THEN
  IF item.price_eur IS NULL OR item.price_eur<=0 THEN missing:=array_append(missing,CASE WHEN item.product_type='project' THEN 'Project price greater than zero' ELSE 'Bundle price greater than zero' END); END IF;
  IF EXISTS(SELECT 1 FROM public.product_members m JOIN public.products p ON p.id=m.tool_id WHERE m.product_id=item.id AND (NOT p.published OR p.product_type<>'tool')) THEN missing:=array_append(missing,'Published individual tools'); END IF;
  IF NOT EXISTS(SELECT 1 FROM public.bundle_releases r JOIN public.product_downloads d ON d.product_id=r.product_id AND d.file_path=r.file_path AND d.enabled WHERE r.product_id=item.id AND (item.product_type<>'project' OR r.project_sha256 IS NOT NULL) AND r.tool_ids=(SELECT array_agg(tool_id ORDER BY tool_id) FROM public.product_members WHERE product_id=item.id)) THEN missing:=array_append(missing,CASE WHEN item.product_type='project' THEN 'Project ZIP and installer matching the included tools' ELSE 'Bundle ZIP matching the included tools' END); END IF;
 END IF;
 IF length(btrim(item.name)) NOT BETWEEN 1 AND 80 OR item.slug !~ '^[a-z0-9][a-z0-9_-]{0,79}$' THEN missing:=array_append(missing,'Valid title'); END IF;
 IF length(btrim(item.subtitle))=0 THEN missing:=array_append(missing,'Subtitle'); END IF;
 IF length(btrim(item.description))=0 THEN missing:=array_append(missing,'Description'); END IF;
 IF length(btrim(item.compatibility))=0 THEN missing:=array_append(missing,'Compatibility'); END IF;
 IF length(btrim(item.current_version))=0 THEN missing:=array_append(missing,'Version'); END IF;
 IF item.price_eur IS NULL OR item.price_eur<0 OR item.price_eur<>round(item.price_eur,2) THEN missing:=array_append(missing,'Valid price'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.category WHERE id=item.category_id AND active) THEN missing:=array_append(missing,'Active category'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.complexity WHERE id=item.complexity_id AND active) THEN missing:=array_append(missing,'Active complexity'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.product_media WHERE product_id=item.id AND role='card' AND file_path IS NOT NULL) THEN missing:=array_append(missing,'Main image'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.product_downloads WHERE product_id=item.id AND enabled AND file_path<>'') THEN missing:=array_append(missing,'Enabled download package'); END IF;
 IF item.product_type<>'tool' AND NOT EXISTS(SELECT 1 FROM public.product_members WHERE product_id=item.id) THEN missing:=array_append(missing,'Included tools'); END IF;
 IF item.price_eur>0 AND NOT EXISTS(SELECT 1 FROM public.live_product_prices WHERE product_id=item.id AND enabled) THEN missing:=array_append(missing,'Verified Paddle price'); END IF;
 RETURN jsonb_build_object('missing',to_jsonb(missing),'ready',cardinality(missing)=0,'updated_at',item.updated_at);
END $$;
REVOKE ALL ON FUNCTION public.live_product_publication_checks(uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.live_product_publication_checks(uuid,bigint) TO service_role;

-- Based on 20261005120000_product_publication_workflow.sql: publish_product_draft; environment-specific references only.
CREATE FUNCTION public.publish_live_product_draft(p_admin_id uuid,p_product_id bigint,p_expected_updated_at timestamptz,p_expected_price_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.products; checks jsonb;
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-price:'||p_product_id::text,0));
 SELECT * INTO item FROM public.products WHERE id=p_product_id FOR UPDATE;
 IF NOT FOUND OR item.published OR item.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'Draft changed' USING ERRCODE='40001'; END IF;
 checks:=public.live_product_publication_checks(p_admin_id,p_product_id);
 IF checks->>'ready' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Publication requirements missing' USING ERRCODE='22023'; END IF;
 IF item.price_eur>0 THEN
  PERFORM 1 FROM public.live_product_prices WHERE product_id=item.id AND enabled AND price_id=p_expected_price_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Price changed' USING ERRCODE='40001'; END IF;
 END IF;
 UPDATE public.products SET published=true,release_date=coalesce(initial_release_date,(clock_timestamp() AT TIME ZONE 'UTC')::date),initial_release_date=coalesce(initial_release_date,(clock_timestamp() AT TIME ZONE 'UTC')::date),updated_at=clock_timestamp() WHERE id=item.id RETURNING * INTO item;
 RETURN jsonb_build_object('id',item.id,'updated_at',item.updated_at);
END $$;
REVOKE ALL ON FUNCTION public.publish_live_product_draft(uuid,bigint,timestamptz,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.publish_live_product_draft(uuid,bigint,timestamptz,text) TO service_role;

CREATE FUNCTION public.process_live_payment_event(p_event jsonb,p_body_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 RETURN public.process_cart_live_payment_event(p_event,p_body_hash);
END $$;
REVOKE ALL ON FUNCTION public.process_live_payment_event(jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_live_payment_event(jsonb,text) TO service_role;

CREATE OR REPLACE FUNCTION public.capture_bundle_order_members() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE members jsonb; provider_name text; transaction_ref text;
BEGIN
 SELECT provider,provider_transaction_id INTO provider_name,transaction_ref FROM public.orders WHERE id=NEW.order_id;
 IF provider_name='paddle' THEN
  SELECT bundle_members->NEW.product_id::text INTO members FROM public.live_checkout_intents WHERE transaction_id=transaction_ref;
 ELSIF provider_name='paddle_sandbox' THEN
  SELECT bundle_members->NEW.product_id::text INTO members FROM public.sandbox_checkout_intents WHERE transaction_id=transaction_ref;
 END IF;
 IF members IS NOT NULL THEN SELECT array_agg(value::bigint ORDER BY value::bigint) INTO NEW.bundled_tool_ids FROM jsonb_array_elements_text(members); END IF;
 RETURN NEW;
END $$;
-- Bind sandbox transaction collisions to their own provider too.
CREATE OR REPLACE FUNCTION public.process_cart_sandbox_payment_event(p_event jsonb,p_body_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE eid text := p_event->>'eventId'; etype text := p_event->>'type'; txn text := p_event->>'txnId'; digest text := p_event->>'eventHash'; occurred timestamptz;
  prior public.sandbox_payment_events%ROWTYPE; intent public.sandbox_checkout_intents%ROWTYPE; purchase public.orders%ROWTYPE; order_item public.order_items%ROWTYPE;
  result text := 'ignored'; expected jsonb; actual jsonb; refunded jsonb; valid boolean; oid bigint; iid bigint;
BEGIN
  IF eid IS NULL OR eid !~ '^(evt|ntfsimevt)_[a-z0-9]{26}$' OR p_body_hash IS NULL OR p_body_hash !~ '^[a-f0-9]{64}$' OR digest IS NULL OR digest !~ '^[a-f0-9]{64}$'
    OR etype IS NULL OR etype !~ '^[a-z_]+\.[a-z_]+$' OR length(etype)>80 OR (txn IS NOT NULL AND txn !~ '^txn_[a-z0-9]{26}$') THEN RETURN jsonb_build_object('ok',false); END IF;
  occurred := (p_event->>'occurredAt')::timestamptz;
  IF occurred IS NULL THEN RETURN jsonb_build_object('ok',false); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-paddle-event:'||eid,0));
  SELECT * INTO prior FROM public.sandbox_payment_events WHERE event_id=eid;
  IF FOUND THEN
    IF prior.event_type IS DISTINCT FROM etype OR prior.transaction_id IS DISTINCT FROM txn OR prior.occurred_at IS DISTINCT FROM occurred OR prior.event_hash IS DISTINCT FROM digest THEN RETURN jsonb_build_object('ok',false); END IF;
    IF prior.outcome<>'review' OR (p_event->>'fullRefund' IS DISTINCT FROM 'true' AND p_event->>'refundedTools' IS DISTINCT FROM 'true') THEN RETURN jsonb_build_object('ok',true,'outcome',prior.outcome); END IF;
  END IF;
  IF txn IS NOT NULL THEN PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-paddle-transaction:'||txn,0)); END IF;
  IF eid LIKE 'ntfsimevt_%' THEN txn := NULL;
  ELSIF etype='transaction.completed' THEN
    result := 'review';
    IF p_event->>'valid'='true' AND txn IS NOT NULL AND p_event->>'intentId' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' THEN
      SELECT * INTO intent FROM public.sandbox_checkout_intents WHERE id=(p_event->>'intentId')::uuid AND version='cart-v1';
      IF FOUND THEN
        PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-ownership:'||intent.user_id::text,0));
        SELECT * INTO intent FROM public.sandbox_checkout_intents WHERE id=intent.id FOR UPDATE;
        IF intent.status IN ('creating','unknown') AND intent.transaction_id IS NULL THEN RETURN jsonb_build_object('ok',false,'outcome','retry_binding'); END IF;
        valid := intent.transaction_id=txn AND intent.currency='EUR' AND (p_event->>'total')::integer BETWEEN 1 AND intent.amount_cents
          AND (intent.charged_amount_cents IS NULL OR intent.charged_amount_cents=(p_event->>'total')::integer)
          AND (intent.amount_cents=(p_event->>'total')::integer OR (p_event->>'taxAdjusted'='true' AND p_event->>'subtotal'=p_event->>'total'))
          AND (p_event->>'subtotal')::integer BETWEEN 0 AND (p_event->>'total')::integer
          AND jsonb_typeof(p_event->'items')='array' AND jsonb_array_length(p_event->'items')=jsonb_array_length(intent.snapshot)
          AND (SELECT count(DISTINCT x->>'providerItemId') FROM jsonb_array_elements(p_event->'items') x)=jsonb_array_length(intent.snapshot);
        IF valid THEN
          valid := (SELECT sum(COALESCE(x->>'chargedAmount',x->>'amount')::integer) FROM jsonb_array_elements(p_event->'items') x)=(p_event->>'total')::integer;
          FOR expected IN SELECT x FROM jsonb_array_elements(intent.snapshot) x LOOP
            SELECT x INTO actual FROM jsonb_array_elements(p_event->'items') x WHERE x->>'priceId'=expected->>'priceId';
            IF NOT FOUND OR actual->>'paddleProductId' IS DISTINCT FROM expected->>'paddleProductId' OR actual->>'amount' IS DISTINCT FROM expected->>'amount' OR COALESCE(actual->>'chargedAmount',actual->>'amount') !~ '^[1-9][0-9]{0,8}$' OR COALESCE(actual->>'chargedAmount',actual->>'amount')::integer NOT BETWEEN 1 AND (expected->>'amount')::integer OR actual->>'providerItemId' IS NULL OR actual->>'providerItemId' !~ '^txnitm_[a-z0-9]{26}$' THEN valid:=false; EXIT; END IF;
          END LOOP;
        END IF;
        IF valid AND NOT EXISTS(SELECT 1 FROM public.sandbox_payment_events WHERE transaction_id=txn AND outcome IN ('review','refunded')) THEN
          IF intent.status='completed' THEN result := 'duplicate';
          ELSIF intent.status='ready' THEN
            PERFORM 1 FROM auth.users WHERE id=intent.user_id AND email_confirmed_at IS NOT NULL AND (banned_until IS NULL OR banned_until<=now()) FOR SHARE;
            IF FOUND AND NOT EXISTS(SELECT 1 FROM public.entitlements e JOIN jsonb_array_elements(intent.snapshot) s ON e.product_id=(s->>'productId')::bigint WHERE e.user_id=intent.user_id AND e.status<>'refunded')
              AND NOT EXISTS(SELECT 1 FROM public.orders WHERE provider='paddle_sandbox' AND provider_transaction_id=txn) THEN
              INSERT INTO public.orders(user_id,provider,provider_transaction_id,status,currency,subtotal,total,provider_created_at)
                VALUES(intent.user_id,'paddle_sandbox',txn,'paid','EUR',(p_event->>'subtotal')::numeric/100,(p_event->>'total')::numeric/100,occurred) RETURNING id INTO oid;
              FOR expected IN SELECT x FROM jsonb_array_elements(intent.snapshot) x LOOP
                SELECT x INTO actual FROM jsonb_array_elements(p_event->'items') x WHERE x->>'priceId'=expected->>'priceId';
                INSERT INTO public.order_items(order_id,product_id,quantity,unit_price,provider_item_id)
                  VALUES(oid,(expected->>'productId')::bigint,1,COALESCE(actual->>'chargedAmount',actual->>'amount')::numeric/100,actual->>'providerItemId') RETURNING id INTO iid;
                INSERT INTO public.entitlements(user_id,product_id,order_item_id,source,status) VALUES(intent.user_id,(expected->>'productId')::bigint,iid,'purchase','active') ON CONFLICT(user_id,product_id) DO UPDATE SET order_item_id=excluded.order_item_id,source='purchase',status='active' WHERE entitlements.status='refunded' OR (entitlements.source='bundle' AND entitlements.status='active');
              IF NOT FOUND THEN RAISE EXCEPTION 'Ownership changed' USING ERRCODE='40001'; END IF;
              END LOOP;
              UPDATE public.sandbox_checkout_intents SET status='completed',charged_amount_cents=(p_event->>'total')::integer,updated_at=now() WHERE id=intent.id;
              result := 'fulfilled';
            END IF;
          END IF;
        END IF;
      END IF;
    END IF;
  ELSIF etype LIKE 'adjustment.%' OR etype='transaction.canceled' THEN
    result := 'review';
    IF etype IN ('adjustment.created','adjustment.updated') AND txn IS NOT NULL AND p_event->>'refundId' ~ '^adj_[a-z0-9]{26}$'
      AND p_event->>'refundTotal' ~ '^[1-9][0-9]{0,8}$' AND (p_event->>'fullRefund'='true' OR p_event->>'refundedTools'='true') THEN
      SELECT * INTO intent FROM public.sandbox_checkout_intents WHERE transaction_id=txn AND version='cart-v1';
      IF FOUND THEN
        PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-ownership:'||intent.user_id::text,0));
        SELECT * INTO intent FROM public.sandbox_checkout_intents WHERE id=intent.id FOR UPDATE;
        SELECT * INTO purchase FROM public.orders WHERE provider='paddle_sandbox' AND provider_transaction_id=txn AND user_id=intent.user_id FOR UPDATE;
        IF FOUND AND intent.status='completed' AND purchase.status IN ('paid','partially_refunded','refunded') AND purchase.currency='EUR' AND purchase.total*100=COALESCE(intent.charged_amount_cents,intent.amount_cents) THEN
          valid := (SELECT count(*) FROM public.order_items WHERE order_id=purchase.id)=jsonb_array_length(intent.snapshot);
          -- A whole-order refund without item detail must cover the exact original total.
          IF p_event->>'refundedTools'='true' THEN
            refunded := p_event->'refundItems';
            valid := valid AND jsonb_typeof(refunded)='array' AND jsonb_array_length(refunded) BETWEEN 1 AND jsonb_array_length(intent.snapshot)
              AND (SELECT count(DISTINCT x->>'providerItemId') FROM jsonb_array_elements(refunded) x)=jsonb_array_length(refunded)
              AND (SELECT sum((x->>'amount')::integer) FROM jsonb_array_elements(refunded) x)=(p_event->>'refundTotal')::integer;
          ELSE
            valid := valid AND purchase.total*100=(p_event->>'refundTotal')::integer;
            SELECT jsonb_agg(jsonb_build_object('providerItemId',provider_item_id,'amount',(unit_price*100)::integer)) INTO refunded FROM public.order_items WHERE order_id=purchase.id;
          END IF;
          IF valid THEN
            FOR actual IN SELECT x FROM jsonb_array_elements(refunded) x LOOP
              SELECT * INTO order_item FROM public.order_items WHERE order_id=purchase.id AND provider_item_id=actual->>'providerItemId' FOR UPDATE;
              IF NOT FOUND OR order_item.quantity<>1 OR order_item.unit_price*100<>(actual->>'amount')::integer THEN valid:=false; EXIT; END IF;
              SELECT x INTO expected FROM jsonb_array_elements(intent.snapshot) x WHERE (x->>'productId')::bigint=order_item.product_id;
              IF NOT FOUND OR (expected->>'amount')::integer<(actual->>'amount')::integer THEN valid:=false; EXIT; END IF;
              PERFORM 1 FROM public.entitlements WHERE user_id=purchase.user_id AND product_id=order_item.product_id AND order_item_id=order_item.id AND source='purchase' AND status IN ('active','refunded','revoked') FOR UPDATE;
              IF NOT FOUND AND NOT order_item.fully_refunded THEN valid:=false; EXIT; END IF;
            END LOOP;
          END IF;
          IF valid THEN
            -- Process each purchase root separately: its projection can touch another tool
            -- in the same cart. A bulk UPDATE would risk PostgreSQL tuple conflicts.
            FOR actual IN SELECT x FROM jsonb_array_elements(refunded) x LOOP
              UPDATE public.entitlements e SET status='refunded' FROM public.order_items i
                WHERE i.order_id=purchase.id AND i.provider_item_id=actual->>'providerItemId' AND e.user_id=purchase.user_id AND e.product_id=i.product_id AND e.order_item_id=i.id AND e.source='purchase' AND e.status='active';
            END LOOP;
            UPDATE public.order_items i SET fully_refunded=true FROM jsonb_array_elements(refunded) r WHERE i.order_id=purchase.id AND i.provider_item_id=r->>'providerItemId';
            -- Financial refund coverage is independent of prior admin entitlement revocation.
            UPDATE public.orders SET status=CASE WHEN EXISTS(SELECT 1 FROM public.order_items WHERE order_id=purchase.id AND NOT fully_refunded) THEN 'partially_refunded' ELSE 'refunded' END WHERE id=purchase.id;
            result := 'refunded';
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;
  INSERT INTO public.sandbox_payment_events(event_id,body_hash,event_type,transaction_id,outcome,occurred_at,event_hash)
    VALUES(eid,p_body_hash,etype,txn,result,occurred,digest)
    ON CONFLICT(event_id) DO UPDATE SET outcome=EXCLUDED.outcome,event_hash=COALESCE(sandbox_payment_events.event_hash,EXCLUDED.event_hash);
  RETURN jsonb_build_object('ok',true,'outcome',result);
END $$;
COMMIT;
