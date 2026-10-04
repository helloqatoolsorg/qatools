BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE OR REPLACE FUNCTION public.process_sandbox_payment_event(p_event jsonb, p_body_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  eid text := p_event->>'eventId'; etype text := p_event->>'type'; txn text := p_event->>'txnId';
  intent public.sandbox_checkout_intents%ROWTYPE; prior public.sandbox_payment_events%ROWTYPE;
  result text := 'ignored'; oid bigint; iid bigint; occurred timestamptz;
  refunded_order public.orders%ROWTYPE; refunded_item public.order_items%ROWTYPE;
BEGIN
  IF eid IS NULL OR eid !~ '^(evt|ntfsimevt)_[a-z0-9]{26}$' OR p_body_hash IS NULL OR p_body_hash !~ '^[a-f0-9]{64}$'
    OR etype IS NULL OR etype !~ '^[a-z_]+\.[a-z_]+$' OR length(etype)>80
    OR (txn IS NOT NULL AND txn !~ '^txn_[a-z0-9]{26}$') THEN
    RETURN jsonb_build_object('ok',false);
  END IF;
  occurred := (p_event->>'occurredAt')::timestamptz;
  IF occurred IS NULL THEN RETURN jsonb_build_object('ok',false); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-paddle-event:' || eid,0));
  SELECT * INTO prior FROM public.sandbox_payment_events WHERE event_id=eid;
  IF FOUND THEN
    IF prior.body_hash<>p_body_hash THEN RETURN jsonb_build_object('ok',false); END IF;
    -- Re-evaluate only the same signed body of a previously reviewed approved refund.
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
            IF FOUND THEN
              UPDATE public.entitlements SET status='refunded' WHERE user_id=refunded_order.user_id
                AND product_id=refunded_item.product_id AND order_item_id=refunded_item.id AND source='purchase' AND status='active';
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
            IF FOUND AND NOT EXISTS(SELECT 1 FROM public.entitlements WHERE user_id=intent.user_id AND product_id=intent.product_id)
              AND NOT EXISTS(SELECT 1 FROM public.orders WHERE provider_transaction_id=txn) THEN
              INSERT INTO public.orders(user_id,provider,provider_transaction_id,status,currency,subtotal,total,provider_created_at)
                VALUES(intent.user_id,'paddle_sandbox',txn,'paid','EUR',(p_event->>'subtotal')::numeric/100,5,occurred)
                RETURNING id INTO oid;
              INSERT INTO public.order_items(order_id,product_id,quantity,unit_price) VALUES(oid,intent.product_id,1,5) RETURNING id INTO iid;
              -- Unique ownership constraint protects even privileged concurrent inserts. Any failure rolls back all writes.
              INSERT INTO public.entitlements(user_id,product_id,order_item_id,source,status)
                VALUES(intent.user_id,intent.product_id,iid,'purchase','active');
              UPDATE public.sandbox_checkout_intents SET status='completed',updated_at=now() WHERE id=intent.id;
              result := 'fulfilled';
            END IF;
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;
  INSERT INTO public.sandbox_payment_events(event_id,body_hash,event_type,transaction_id,outcome,occurred_at)
    VALUES(eid,p_body_hash,etype,txn,result,occurred)
    ON CONFLICT (event_id) DO UPDATE SET outcome=EXCLUDED.outcome
      WHERE sandbox_payment_events.body_hash=EXCLUDED.body_hash;
  RETURN jsonb_build_object('ok',true,'outcome',result);
END $$;

COMMIT;
