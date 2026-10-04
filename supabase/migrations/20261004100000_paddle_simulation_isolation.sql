BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.sandbox_payment_events DROP CONSTRAINT sandbox_payment_events_event_id_check;
ALTER TABLE public.sandbox_payment_events ADD CONSTRAINT sandbox_payment_events_event_id_check
  CHECK(event_id ~ '^(evt|ntfsimevt)_[a-z0-9]{26}$');
CREATE OR REPLACE FUNCTION public.process_sandbox_payment_event(p_event jsonb, p_body_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  eid text := p_event->>'eventId'; etype text := p_event->>'type'; txn text := p_event->>'txnId';
  intent public.sandbox_checkout_intents%ROWTYPE; prior public.sandbox_payment_events%ROWTYPE;
  result text := 'ignored'; oid bigint; iid bigint; occurred timestamptz;
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
  IF FOUND THEN RETURN jsonb_build_object('ok',prior.body_hash=p_body_hash,'outcome',prior.outcome); END IF;
  IF txn IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-paddle-transaction:' || txn,0));
  END IF;
  -- Refund/adjustment/cancellation policy is unresolved. Record for review; do not revoke or restore ownership.
  -- These records block later/out-of-order completion from granting ownership automatically.
  IF eid LIKE 'ntfsimevt_%' THEN
    -- Simulations never bind transactions, block purchases, or grant ownership.
    txn := NULL;
    result := 'ignored';
  ELSIF etype LIKE 'adjustment.%' OR etype='transaction.canceled' THEN
    result := 'review';
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
          AND NOT EXISTS(SELECT 1 FROM public.sandbox_payment_events WHERE transaction_id=txn AND outcome='review') THEN
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
    VALUES(eid,p_body_hash,etype,txn,result,occurred);
  RETURN jsonb_build_object('ok',true,'outcome',result);
END $$;

COMMIT;
