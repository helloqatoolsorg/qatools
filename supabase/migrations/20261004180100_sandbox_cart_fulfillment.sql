BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER FUNCTION public.process_sandbox_payment_event(jsonb,text) RENAME TO process_legacy_sandbox_payment_event;
REVOKE ALL ON FUNCTION public.process_legacy_sandbox_payment_event(jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.process_cart_sandbox_payment_event(p_event jsonb,p_body_hash text)
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
        valid := intent.transaction_id=txn AND intent.currency='EUR' AND intent.amount_cents=(p_event->>'total')::integer
          AND (p_event->>'subtotal')::integer BETWEEN 0 AND intent.amount_cents
          AND jsonb_typeof(p_event->'items')='array' AND jsonb_array_length(p_event->'items')=jsonb_array_length(intent.snapshot)
          AND (SELECT count(DISTINCT x->>'providerItemId') FROM jsonb_array_elements(p_event->'items') x)=jsonb_array_length(intent.snapshot);
        IF valid THEN
          FOR expected IN SELECT x FROM jsonb_array_elements(intent.snapshot) x LOOP
            SELECT x INTO actual FROM jsonb_array_elements(p_event->'items') x WHERE x->>'priceId'=expected->>'priceId';
            IF NOT FOUND OR actual->>'paddleProductId' IS DISTINCT FROM expected->>'paddleProductId' OR actual->>'amount' IS DISTINCT FROM expected->>'amount' OR actual->>'providerItemId' IS NULL OR actual->>'providerItemId' !~ '^txnitm_[a-z0-9]{26}$' THEN valid:=false; EXIT; END IF;
          END LOOP;
        END IF;
        IF valid AND NOT EXISTS(SELECT 1 FROM public.sandbox_payment_events WHERE transaction_id=txn AND outcome IN ('review','refunded')) THEN
          IF intent.status='completed' THEN result := 'duplicate';
          ELSIF intent.status='ready' THEN
            PERFORM 1 FROM auth.users WHERE id=intent.user_id AND email_confirmed_at IS NOT NULL AND (banned_until IS NULL OR banned_until<=now()) FOR SHARE;
            IF FOUND AND NOT EXISTS(SELECT 1 FROM public.entitlements e JOIN jsonb_array_elements(intent.snapshot) s ON e.product_id=(s->>'productId')::bigint WHERE e.user_id=intent.user_id)
              AND NOT EXISTS(SELECT 1 FROM public.orders WHERE provider_transaction_id=txn) THEN
              INSERT INTO public.orders(user_id,provider,provider_transaction_id,status,currency,subtotal,total,provider_created_at)
                VALUES(intent.user_id,'paddle_sandbox',txn,'paid','EUR',(p_event->>'subtotal')::numeric/100,intent.amount_cents::numeric/100,occurred) RETURNING id INTO oid;
              FOR expected IN SELECT x FROM jsonb_array_elements(intent.snapshot) x LOOP
                SELECT x INTO actual FROM jsonb_array_elements(p_event->'items') x WHERE x->>'priceId'=expected->>'priceId';
                INSERT INTO public.order_items(order_id,product_id,quantity,unit_price,provider_item_id)
                  VALUES(oid,(expected->>'productId')::bigint,1,(expected->>'amount')::numeric/100,actual->>'providerItemId') RETURNING id INTO iid;
                INSERT INTO public.entitlements(user_id,product_id,order_item_id,source,status) VALUES(intent.user_id,(expected->>'productId')::bigint,iid,'purchase','active');
              END LOOP;
              UPDATE public.sandbox_checkout_intents SET status='completed',updated_at=now() WHERE id=intent.id;
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
        IF FOUND AND intent.status='completed' AND purchase.status IN ('paid','partially_refunded','refunded') AND purchase.currency='EUR' AND purchase.total*100=intent.amount_cents THEN
          valid := (SELECT count(*) FROM public.order_items WHERE order_id=purchase.id)=jsonb_array_length(intent.snapshot);
          -- A whole-order refund without item detail must cover the exact original total.
          IF p_event->>'refundedTools'='true' THEN
            refunded := p_event->'refundItems';
            valid := valid AND jsonb_typeof(refunded)='array' AND jsonb_array_length(refunded) BETWEEN 1 AND jsonb_array_length(intent.snapshot)
              AND (SELECT count(DISTINCT x->>'providerItemId') FROM jsonb_array_elements(refunded) x)=jsonb_array_length(refunded)
              AND (SELECT sum((x->>'amount')::integer) FROM jsonb_array_elements(refunded) x)=(p_event->>'refundTotal')::integer;
          ELSE
            valid := valid AND intent.amount_cents=(p_event->>'refundTotal')::integer;
            SELECT jsonb_agg(jsonb_build_object('providerItemId',provider_item_id,'amount',(unit_price*100)::integer)) INTO refunded FROM public.order_items WHERE order_id=purchase.id;
          END IF;
          IF valid THEN
            FOR actual IN SELECT x FROM jsonb_array_elements(refunded) x LOOP
              SELECT * INTO order_item FROM public.order_items WHERE order_id=purchase.id AND provider_item_id=actual->>'providerItemId' FOR UPDATE;
              IF NOT FOUND OR order_item.quantity<>1 OR order_item.unit_price*100<>(actual->>'amount')::integer THEN valid:=false; EXIT; END IF;
              SELECT x INTO expected FROM jsonb_array_elements(intent.snapshot) x WHERE (x->>'productId')::bigint=order_item.product_id;
              IF NOT FOUND OR (expected->>'amount')::integer<>(actual->>'amount')::integer THEN valid:=false; EXIT; END IF;
              PERFORM 1 FROM public.entitlements WHERE user_id=purchase.user_id AND product_id=order_item.product_id AND order_item_id=order_item.id AND source='purchase' AND status IN ('active','refunded','revoked') FOR UPDATE;
              IF NOT FOUND THEN valid:=false; EXIT; END IF;
            END LOOP;
          END IF;
          IF valid THEN
            UPDATE public.entitlements e SET status='refunded' FROM public.order_items i,jsonb_array_elements(refunded) r
              WHERE i.order_id=purchase.id AND i.provider_item_id=r->>'providerItemId' AND e.user_id=purchase.user_id AND e.product_id=i.product_id AND e.order_item_id=i.id AND e.source='purchase' AND e.status='active';
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
CREATE FUNCTION public.process_sandbox_payment_event(p_event jsonb,p_body_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_event->>'checkoutVersion'='cart-v1' OR EXISTS(SELECT 1 FROM public.sandbox_checkout_intents WHERE version='cart-v1' AND transaction_id=p_event->>'txnId') THEN
    RETURN public.process_cart_sandbox_payment_event(p_event,p_body_hash);
  END IF;
  RETURN public.process_legacy_sandbox_payment_event(p_event,p_body_hash);
END $$;
REVOKE ALL ON FUNCTION public.process_cart_sandbox_payment_event(jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.process_sandbox_payment_event(jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_sandbox_payment_event(jsonb,text) TO service_role;
COMMIT;
