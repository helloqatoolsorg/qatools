-- Refunded products can be purchased again; active and revoked access remain protected.
-- New payments create new orders. Refunds stay tied to the original order item.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.reserve_sandbox_cart_base(p_user_id uuid,p_items jsonb)
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
    IF EXISTS(SELECT 1 FROM public.entitlements WHERE user_id=p_user_id AND product_id=product.id AND status<>'refunded') THEN RETURN jsonb_build_object('ok',false,'code','ownership_exists'); END IF;
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
              AND NOT EXISTS(SELECT 1 FROM public.orders WHERE provider_transaction_id=txn) THEN
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

CREATE OR REPLACE FUNCTION public.reserve_legacy_sandbox_checkout(p_user_id uuid, p_product_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE intent public.sandbox_checkout_intents%ROWTYPE;
BEGIN
  PERFORM 1 FROM auth.users WHERE id=p_user_id AND email_confirmed_at IS NOT NULL
    AND (banned_until IS NULL OR banned_until<=now()) FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','account_unavailable'); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-ownership:' || p_user_id::text,0));
  PERFORM 1 FROM public.products WHERE id=p_product_id AND id=1 AND slug='qafit01' AND published AND price_eur=5 FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','item_unavailable'); END IF;
  IF EXISTS(SELECT 1 FROM public.entitlements WHERE user_id=p_user_id AND product_id=p_product_id AND status<>'refunded') THEN
    RETURN jsonb_build_object('ok',false,'code','ownership_exists');
  END IF;
  SELECT * INTO intent FROM public.sandbox_checkout_intents WHERE user_id=p_user_id AND product_id=p_product_id
    AND status IN ('creating','ready','unknown') FOR UPDATE;
  IF FOUND THEN RETURN jsonb_build_object('ok',true,'created',false,'intent',to_jsonb(intent)); END IF;
  INSERT INTO public.sandbox_checkout_intents(user_id,product_id,price_id,amount_cents,currency)
    VALUES(p_user_id,p_product_id,'pri_01m41bkp4f0fxgb9cfm37n5p4b',500,'EUR') RETURNING * INTO intent;
  RETURN jsonb_build_object('ok',true,'created',true,'intent',to_jsonb(intent));
END $$;

CREATE OR REPLACE FUNCTION public.process_legacy_sandbox_payment_event(p_event jsonb, p_body_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  eid text := p_event->>'eventId'; etype text := p_event->>'type'; txn text := p_event->>'txnId';
  intent public.sandbox_checkout_intents%ROWTYPE; prior public.sandbox_payment_events%ROWTYPE;
  result text := 'ignored'; oid bigint; iid bigint; occurred timestamptz;
  stable_hash text := p_event->>'eventHash';
  refunded_order public.orders%ROWTYPE; refunded_item public.order_items%ROWTYPE;
BEGIN
  IF eid IS NULL OR eid !~ '^(evt|ntfsimevt)_[a-z0-9]{26}$' OR p_body_hash IS NULL OR p_body_hash !~ '^[a-f0-9]{64}$'
    OR etype IS NULL OR etype !~ '^[a-z_]+\.[a-z_]+$' OR length(etype)>80
    OR (txn IS NOT NULL AND txn !~ '^txn_[a-z0-9]{26}$') THEN
    RETURN jsonb_build_object('ok',false);
  END IF;
  IF stable_hash IS NOT NULL AND stable_hash !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('ok',false); END IF;
  occurred := (p_event->>'occurredAt')::timestamptz;
  IF occurred IS NULL THEN RETURN jsonb_build_object('ok',false); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-paddle-event:' || eid,0));
  SELECT * INTO prior FROM public.sandbox_payment_events WHERE event_id=eid;
  IF FOUND THEN
    IF prior.event_type IS DISTINCT FROM etype OR prior.transaction_id IS DISTINCT FROM txn
      OR prior.occurred_at IS DISTINCT FROM occurred THEN RETURN jsonb_build_object('ok',false); END IF;
    IF prior.event_hash IS NOT NULL THEN
      IF stable_hash IS DISTINCT FROM prior.event_hash THEN RETURN jsonb_build_object('ok',false); END IF;
    ELSIF prior.body_hash<>p_body_hash AND stable_hash IS NULL THEN
      RETURN jsonb_build_object('ok',false);
    END IF;
    -- Legacy rows lack a stable digest. A fresh verified provider delivery may
    -- adopt one only for the same event/type/transaction/time. Existing terminal
    -- outcomes are returned unchanged; reviewed approved refunds are fully rebound below.
    -- Re-evaluate a previously reviewed approved refund from a verified delivery.
    -- Fulfilled, ignored, duplicate and already-refunded events remain idempotent.
    IF prior.outcome<>'review' OR p_event->>'fullRefund' IS DISTINCT FROM 'true'
      OR etype NOT IN ('adjustment.created','adjustment.updated') THEN
      RETURN jsonb_build_object('ok',true,'outcome',prior.outcome);
    END IF;
  END IF;
  IF txn IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-paddle-transaction:' || txn,0));
  END IF;
  -- Approved full refunds remove only the corresponding purchase entitlement.
  -- These records block later/out-of-order completion from granting ownership automatically.
  IF eid LIKE 'ntfsimevt_%' THEN
    -- Simulations never bind transactions, block purchases, or grant ownership.
    txn := NULL;
    result := 'ignored';
  ELSIF etype LIKE 'adjustment.%' OR etype='transaction.canceled' THEN
    result := 'review';
    IF etype IN ('adjustment.created','adjustment.updated') AND txn IS NOT NULL
      AND p_event->>'fullRefund'='true' AND p_event->>'refundId' ~ '^adj_[a-z0-9]{26}$'
      AND p_event->>'refundTotal' ~ '^[1-9][0-9]{0,8}$' THEN
      SELECT * INTO refunded_order FROM public.orders WHERE provider='paddle_sandbox' AND provider_transaction_id=txn;
      IF FOUND THEN
        PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-ownership:' || refunded_order.user_id::text,0));
        SELECT * INTO refunded_order FROM public.orders WHERE id=refunded_order.id FOR UPDATE;
        SELECT * INTO intent FROM public.sandbox_checkout_intents WHERE transaction_id=txn FOR UPDATE;
        IF FOUND AND intent.status='completed' AND intent.user_id=refunded_order.user_id
          AND refunded_order.status IN ('paid','partially_refunded','refunded')
          AND refunded_order.currency='EUR' AND intent.currency='EUR'
          AND refunded_order.total*100=(p_event->>'refundTotal')::numeric
          AND intent.amount_cents=(p_event->>'refundTotal')::integer
          AND (SELECT count(*) FROM public.order_items WHERE order_id=refunded_order.id)=1 THEN
          SELECT * INTO refunded_item FROM public.order_items WHERE order_id=refunded_order.id FOR UPDATE;
          IF FOUND AND refunded_item.product_id=intent.product_id AND refunded_item.quantity=1
            AND refunded_item.unit_price=refunded_order.total THEN
            PERFORM 1 FROM public.entitlements WHERE user_id=refunded_order.user_id
              AND product_id=refunded_item.product_id AND order_item_id=refunded_item.id AND source='purchase'
              AND status IN ('active','refunded','revoked') FOR UPDATE;
            IF FOUND OR refunded_item.fully_refunded THEN
              UPDATE public.entitlements SET status='refunded' WHERE user_id=refunded_order.user_id
                AND product_id=refunded_item.product_id AND order_item_id=refunded_item.id AND source='purchase' AND status='active';
              UPDATE public.order_items SET fully_refunded=true WHERE id=refunded_item.id;
              UPDATE public.orders SET status='refunded' WHERE id=refunded_order.id;
              result := 'refunded';
            END IF;
          END IF;
        END IF;
      END IF;
    END IF;
  ELSIF etype='transaction.completed' THEN
    result := 'review';
    IF p_event->>'valid'='true' AND txn IS NOT NULL AND p_event->>'intentId' IS NOT NULL THEN
      SELECT * INTO intent FROM public.sandbox_checkout_intents WHERE id=(p_event->>'intentId')::uuid;
      IF FOUND THEN
        PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-ownership:' || intent.user_id::text,0));
        SELECT * INTO intent FROM public.sandbox_checkout_intents WHERE id=intent.id FOR UPDATE;
        -- Completion may arrive before the checkout route binds its provider response. Ask Paddle to retry.
        IF intent.status IN ('creating','unknown') AND intent.transaction_id IS NULL THEN
          RETURN jsonb_build_object('ok',false,'outcome','retry_binding');
        END IF;
        IF intent.transaction_id=txn AND intent.price_id=p_event->>'priceId'
          AND intent.amount_cents=(p_event->>'total')::integer AND intent.currency='EUR'
          AND (p_event->>'subtotal')::integer BETWEEN 0 AND intent.amount_cents
          AND NOT EXISTS(SELECT 1 FROM public.sandbox_payment_events WHERE transaction_id=txn AND outcome IN ('review','refunded')) THEN
          IF intent.status='completed' THEN
            result := 'duplicate';
          ELSIF intent.status='ready' THEN
            PERFORM 1 FROM auth.users WHERE id=intent.user_id AND email_confirmed_at IS NOT NULL
              AND (banned_until IS NULL OR banned_until<=now()) FOR SHARE;
            IF FOUND AND NOT EXISTS(SELECT 1 FROM public.entitlements WHERE user_id=intent.user_id AND product_id=intent.product_id AND status<>'refunded')
              AND NOT EXISTS(SELECT 1 FROM public.orders WHERE provider_transaction_id=txn) THEN
              INSERT INTO public.orders(user_id,provider,provider_transaction_id,status,currency,subtotal,total,provider_created_at)
                VALUES(intent.user_id,'paddle_sandbox',txn,'paid','EUR',(p_event->>'subtotal')::numeric/100,5,occurred)
                RETURNING id INTO oid;
              INSERT INTO public.order_items(order_id,product_id,quantity,unit_price) VALUES(oid,intent.product_id,1,5) RETURNING id INTO iid;
              -- Unique ownership constraint protects even privileged concurrent inserts. Any failure rolls back all writes.
              INSERT INTO public.entitlements(user_id,product_id,order_item_id,source,status)
                VALUES(intent.user_id,intent.product_id,iid,'purchase','active')
                ON CONFLICT(user_id,product_id) DO UPDATE SET order_item_id=excluded.order_item_id,source='purchase',status='active' WHERE entitlements.status='refunded';
              IF NOT FOUND THEN RAISE EXCEPTION 'Ownership changed' USING ERRCODE='40001'; END IF;
              UPDATE public.sandbox_checkout_intents SET status='completed',updated_at=now() WHERE id=intent.id;
              result := 'fulfilled';
            END IF;
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;
  INSERT INTO public.sandbox_payment_events(event_id,body_hash,event_type,transaction_id,outcome,occurred_at,event_hash)
    VALUES(eid,p_body_hash,etype,txn,result,occurred,stable_hash)
    ON CONFLICT (event_id) DO UPDATE SET outcome=EXCLUDED.outcome,
      event_hash=COALESCE(sandbox_payment_events.event_hash,EXCLUDED.event_hash);
  RETURN jsonb_build_object('ok',true,'outcome',result);
END $$;
COMMIT;
