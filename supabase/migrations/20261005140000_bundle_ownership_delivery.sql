BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.products DROP CONSTRAINT composed_products_remain_drafts;
ALTER TABLE public.products ADD CONSTRAINT projects_remain_drafts CHECK(product_type<>'project' OR NOT published);
ALTER TABLE public.entitlements DROP CONSTRAINT entitlements_source_check;
ALTER TABLE public.entitlements ADD CONSTRAINT entitlements_source_check CHECK(source IN ('purchase','free','admin','bundle'));
CREATE TABLE public.bundle_releases(product_id bigint PRIMARY KEY REFERENCES public.products(id),file_path text NOT NULL,tool_ids bigint[] NOT NULL CHECK(cardinality(tool_ids)>0));
CREATE TABLE public.entitlement_origins(root_id bigint NOT NULL REFERENCES public.entitlements(id) ON DELETE CASCADE,tool_id bigint NOT NULL REFERENCES public.products(id),status text NOT NULL CHECK(status IN ('active','refunded','revoked')),PRIMARY KEY(root_id,tool_id));
ALTER TABLE public.bundle_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlement_origins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bundle_releases,public.entitlement_origins FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO public.entitlement_origins SELECT id,product_id,status FROM public.entitlements;
ALTER TABLE public.sandbox_checkout_intents ADD COLUMN bundle_members jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.order_items ADD COLUMN bundled_tool_ids bigint[] NOT NULL DEFAULT '{}';
CREATE FUNCTION public.freeze_product_members() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.products WHERE (id=CASE WHEN TG_OP='DELETE' THEN OLD.product_id ELSE NEW.product_id END OR (TG_OP='UPDATE' AND id=OLD.product_id)) AND (published OR initial_release_date IS NOT NULL)) THEN RAISE EXCEPTION 'Released bundle membership is immutable' USING ERRCODE='40001'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER freeze_product_members BEFORE INSERT OR UPDATE OR DELETE ON public.product_members FOR EACH ROW EXECUTE FUNCTION public.freeze_product_members();
CREATE FUNCTION public.capture_bundle_order_members() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE members jsonb;
BEGIN
 SELECT i.bundle_members->NEW.product_id::text INTO members FROM public.orders o JOIN public.sandbox_checkout_intents i ON i.transaction_id=o.provider_transaction_id WHERE o.id=NEW.order_id;
 IF members IS NOT NULL THEN SELECT array_agg(value::bigint ORDER BY value::bigint) INTO NEW.bundled_tool_ids FROM jsonb_array_elements_text(members); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER capture_bundle_order_members BEFORE INSERT ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.capture_bundle_order_members();
CREATE FUNCTION public.lock_entitlement_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF pg_trigger_depth()=1 THEN PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-ownership:'||NEW.user_id::text,0)); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lock_entitlement_insert BEFORE INSERT ON public.entitlements FOR EACH ROW EXECUTE FUNCTION public.lock_entitlement_insert();
REVOKE ALL ON FUNCTION public.lock_entitlement_insert() FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.project_entitlement_origins() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE targets bigint[]; target bigint; effective text; inherited_source text;
BEGIN
 -- Nested projection writes must never be mistaken for a new commercial grant.
 IF pg_trigger_depth()>1 OR NEW.source='bundle' THEN RETURN NEW; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-ownership:'||NEW.user_id::text,0));
 targets:=ARRAY[NEW.product_id];
 IF TG_OP='INSERT' OR NOT EXISTS(SELECT 1 FROM public.entitlement_origins WHERE root_id=NEW.id) THEN
  IF NEW.order_item_id IS NOT NULL THEN SELECT targets||bundled_tool_ids INTO targets FROM public.order_items WHERE id=NEW.order_item_id;
  ELSIF EXISTS(SELECT 1 FROM public.products WHERE id=NEW.product_id AND product_type='bundle') THEN
   SELECT targets||r.tool_ids INTO targets FROM public.bundle_releases r JOIN public.products p ON p.id=r.product_id WHERE r.product_id=NEW.product_id AND p.published;
   IF targets IS NULL THEN RAISE EXCEPTION 'Published bundle release required' USING ERRCODE='22023'; END IF;
  END IF;
  INSERT INTO public.entitlement_origins(root_id,tool_id,status) SELECT NEW.id,unnest(targets),NEW.status ON CONFLICT(root_id,tool_id) DO UPDATE SET status=excluded.status;
 ELSE
  UPDATE public.entitlement_origins SET status=NEW.status WHERE root_id=NEW.id;
  SELECT array_agg(tool_id ORDER BY tool_id) INTO targets FROM public.entitlement_origins WHERE root_id=NEW.id;
 END IF;
 FOREACH target IN ARRAY targets LOOP
  SELECT CASE WHEN bool_or(g.status='active') THEN 'active' WHEN bool_or(g.status='revoked') THEN 'revoked' ELSE 'refunded' END INTO effective
   FROM public.entitlement_origins g JOIN public.entitlements r ON r.id=g.root_id WHERE r.user_id=NEW.user_id AND g.tool_id=target;
  SELECT CASE WHEN bool_or(g.status='active' AND r.source='purchase') THEN 'bundle' WHEN bool_or(g.status='active' AND r.source='admin') THEN 'admin' ELSE 'bundle' END INTO inherited_source
   FROM public.entitlement_origins g JOIN public.entitlements r ON r.id=g.root_id WHERE r.user_id=NEW.user_id AND g.tool_id=target;
  INSERT INTO public.entitlements(user_id,product_id,source,status) VALUES(NEW.user_id,target,inherited_source,effective)
   ON CONFLICT(user_id,product_id) DO UPDATE SET status=excluded.status,
    source=CASE WHEN EXISTS(SELECT 1 FROM public.entitlement_origins WHERE root_id=entitlements.id) THEN entitlements.source ELSE excluded.source END
    WHERE entitlements.status<>'revoked' AND (entitlements.status IS DISTINCT FROM excluded.status OR (entitlements.source IS DISTINCT FROM excluded.source AND NOT EXISTS(SELECT 1 FROM public.entitlement_origins WHERE root_id=entitlements.id)));
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER project_entitlement_origins AFTER INSERT OR UPDATE OF status,source,order_item_id ON public.entitlements FOR EACH ROW EXECUTE FUNCTION public.project_entitlement_origins();
ALTER FUNCTION public.reserve_sandbox_cart(uuid,jsonb) RENAME TO reserve_sandbox_cart_base;
REVOKE ALL ON FUNCTION public.reserve_sandbox_cart_base(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.reserve_sandbox_cart(p_user_id uuid,p_items jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; line jsonb; item public.products; release public.bundle_releases; pinned jsonb:='{}';
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-ownership:'||p_user_id::text,0));
 IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN RETURN jsonb_build_object('ok',false); END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  SELECT * INTO item FROM public.products WHERE id=(line->>'productId')::bigint FOR SHARE;
  IF NOT FOUND OR item.product_type='project' THEN RETURN jsonb_build_object('ok',false,'code','unsupported_product'); END IF;
  IF item.product_type='bundle' THEN
   SELECT * INTO release FROM public.bundle_releases WHERE product_id=item.id;
   IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.product_downloads WHERE product_id=item.id AND enabled AND file_path=release.file_path)
    OR release.tool_ids IS DISTINCT FROM (SELECT array_agg(tool_id ORDER BY tool_id) FROM public.product_members WHERE product_id=item.id)
    THEN RETURN jsonb_build_object('ok',false,'code','bundle_not_ready'); END IF;
   IF EXISTS(SELECT 1 FROM public.entitlements WHERE user_id=p_user_id AND product_id=ANY(release.tool_ids) AND status='revoked') THEN RETURN jsonb_build_object('ok',false,'code','revoked_access'); END IF;
   pinned:=pinned||jsonb_build_object(item.id::text,to_jsonb(release.tool_ids));
  END IF;
 END LOOP;
 result:=public.reserve_sandbox_cart_base(p_user_id,p_items);
 IF result->>'created'='true' THEN UPDATE public.sandbox_checkout_intents SET bundle_members=pinned WHERE id=(result->'intent'->>'id')::uuid; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.reserve_sandbox_cart(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_sandbox_cart(uuid,jsonb) TO service_role;
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
            IF FOUND AND NOT EXISTS(SELECT 1 FROM public.entitlements e JOIN jsonb_array_elements(intent.snapshot) s ON e.product_id=(s->>'productId')::bigint WHERE e.user_id=intent.user_id)
              AND NOT EXISTS(SELECT 1 FROM public.orders WHERE provider_transaction_id=txn) THEN
              INSERT INTO public.orders(user_id,provider,provider_transaction_id,status,currency,subtotal,total,provider_created_at)
                VALUES(intent.user_id,'paddle_sandbox',txn,'paid','EUR',(p_event->>'subtotal')::numeric/100,(p_event->>'total')::numeric/100,occurred) RETURNING id INTO oid;
              FOR expected IN SELECT x FROM jsonb_array_elements(intent.snapshot) x LOOP
                SELECT x INTO actual FROM jsonb_array_elements(p_event->'items') x WHERE x->>'priceId'=expected->>'priceId';
                INSERT INTO public.order_items(order_id,product_id,quantity,unit_price,provider_item_id)
                  VALUES(oid,(expected->>'productId')::bigint,1,COALESCE(actual->>'chargedAmount',actual->>'amount')::numeric/100,actual->>'providerItemId') RETURNING id INTO iid;
                INSERT INTO public.entitlements(user_id,product_id,order_item_id,source,status) VALUES(intent.user_id,(expected->>'productId')::bigint,iid,'purchase','active') ON CONFLICT(user_id,product_id) DO UPDATE SET order_item_id=excluded.order_item_id,source='purchase',status='active' WHERE entitlements.source='bundle';
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
              IF NOT FOUND THEN valid:=false; EXIT; END IF;
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
CREATE OR REPLACE FUNCTION public.product_publication_checks(p_admin_id uuid,p_product_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.products; missing text[]:='{}';
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=p_admin_id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
 SELECT * INTO item FROM public.products WHERE id=p_product_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Product not found' USING ERRCODE='22023'; END IF;
 IF item.product_type='project' THEN missing:=array_append(missing,'Project ownership and delivery verification'); END IF;
 IF item.product_type='bundle' THEN
  IF item.price_eur IS NULL OR item.price_eur<=0 OR item.price_eur>=(SELECT coalesce(sum(p.price_eur),0) FROM public.product_members m JOIN public.products p ON p.id=m.tool_id WHERE m.product_id=item.id) THEN missing:=array_append(missing,'Bundle price below the included tools total'); END IF;
  IF EXISTS(SELECT 1 FROM public.product_members m JOIN public.products p ON p.id=m.tool_id WHERE m.product_id=item.id AND (NOT p.published OR p.product_type<>'tool')) THEN missing:=array_append(missing,'Published individual tools'); END IF;
  IF NOT EXISTS(SELECT 1 FROM public.bundle_releases r JOIN public.product_downloads d ON d.product_id=r.product_id AND d.file_path=r.file_path AND d.enabled WHERE r.product_id=item.id AND r.tool_ids=(SELECT array_agg(tool_id ORDER BY tool_id) FROM public.product_members WHERE product_id=item.id)) THEN missing:=array_append(missing,'Bundle ZIP matching the included tools'); END IF;
 END IF;
 IF item.name<>item.slug OR item.slug !~ '^[a-z0-9][a-z0-9_-]{0,79}$' THEN missing:=array_append(missing,'Valid title'); END IF;
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
 IF item.price_eur>0 AND NOT EXISTS(SELECT 1 FROM public.sandbox_product_prices WHERE product_id=item.id AND enabled) THEN missing:=array_append(missing,'Verified Paddle price'); END IF;
 RETURN jsonb_build_object('missing',to_jsonb(missing),'ready',cardinality(missing)=0,'updated_at',item.updated_at);
END $$;
CREATE FUNCTION public.set_bundle_download(p_admin_id uuid,p_product_id bigint,p_expected_path text,p_file_path text,p_file_name text,p_tool_ids bigint[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; item public.products; selected bigint[];
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=p_admin_id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN RETURN jsonb_build_object('ok',false); END IF;
 SELECT * INTO item FROM public.products WHERE id=p_product_id FOR UPDATE;
 SELECT array_agg(tool_id ORDER BY tool_id) INTO selected FROM public.product_members WHERE product_id=p_product_id;
 IF item.product_type IS DISTINCT FROM 'bundle' OR selected IS NULL OR selected IS DISTINCT FROM p_tool_ids THEN RETURN jsonb_build_object('ok',false); END IF;
 -- The trusted route validated every HDA before calling this writer. The mapping and attestation commit together.
 INSERT INTO public.bundle_releases VALUES(p_product_id,p_file_path,p_tool_ids) ON CONFLICT(product_id) DO UPDATE SET file_path=excluded.file_path,tool_ids=excluded.tool_ids;
 result:=public.set_product_download(p_admin_id,p_product_id,p_expected_path,p_file_path,p_file_name,true);
 IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Bundle download changed' USING ERRCODE='40001'; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.set_bundle_download(uuid,bigint,text,text,text,bigint[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_bundle_download(uuid,bigint,text,text,text,bigint[]) TO service_role;
CREATE OR REPLACE FUNCTION public.set_product_download(
  p_admin_id uuid, p_product_id bigint, p_expected_path text,
  p_file_path text, p_file_name text, p_enabled boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous public.product_downloads%ROWTYPE; next_path text; next_name text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=p_admin_id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN RETURN jsonb_build_object('ok',false,'code','not_admin'); END IF;
  IF p_file_path IS NOT NULL AND EXISTS(SELECT 1 FROM public.products WHERE id=p_product_id AND product_type='bundle') AND NOT EXISTS(SELECT 1 FROM public.bundle_releases WHERE product_id=p_product_id AND file_path=p_file_path) THEN RETURN jsonb_build_object('ok',false,'code','bundle_validation_required'); END IF;
  PERFORM 1 FROM public.admin_users WHERE user_id=p_admin_id FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','not_admin'); END IF;
  IF p_product_id IS NULL OR p_product_id<=0 OR p_enabled IS NULL THEN
    RETURN jsonb_build_object('ok',false,'code','invalid_request');
  END IF;
  PERFORM 1 FROM public.products WHERE id=p_product_id FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','missing_product'); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-download:'||p_product_id::text,0));
  SELECT * INTO previous FROM public.product_downloads WHERE product_id=p_product_id FOR UPDATE;
  IF previous.file_path IS DISTINCT FROM p_expected_path THEN
    RETURN jsonb_build_object('ok',false,'code','download_changed');
  END IF;
  IF p_file_path IS NULL THEN
    IF previous.file_path IS NULL THEN RETURN jsonb_build_object('ok',false,'code','missing_file'); END IF;
    next_path:=previous.file_path; next_name:=previous.file_name;
  ELSE
    IF p_file_name IS NULL OR p_file_name !~ '^[A-Za-z0-9][A-Za-z0-9._-]*\.[zZ][iI][pP]$'
       OR length(p_file_name)>128
       OR p_file_path !~ ('^'||p_product_id::text||'/[0-9a-f-]{36}/')
       OR p_file_path <> split_part(p_file_path,'/',1)||'/'||split_part(p_file_path,'/',2)||'/'||p_file_name THEN
      RETURN jsonb_build_object('ok',false,'code','invalid_request');
    END IF;
    next_path:=p_file_path; next_name:=p_file_name;
  END IF;
  IF p_enabled AND (
    NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='qatools-downloads' AND NOT public)
    OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='qatools-downloads' AND name=next_path)
  ) THEN RETURN jsonb_build_object('ok',false,'code','missing_file'); END IF;
  INSERT INTO public.product_downloads(product_id,file_path,file_name,enabled)
    VALUES(p_product_id,next_path,next_name,p_enabled)
    ON CONFLICT(product_id) DO UPDATE SET file_path=excluded.file_path,file_name=excluded.file_name,enabled=excluded.enabled
    WHERE product_downloads.file_path IS NOT DISTINCT FROM p_expected_path;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','download_changed'); END IF;
  RETURN jsonb_build_object('ok',true);
END $$;
CREATE OR REPLACE FUNCTION public.record_product_download(p_request_id uuid,p_user_id uuid,p_product_id bigint,p_file_path text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE acquired_source text;
BEGIN
  IF p_request_id IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id AND email_confirmed_at IS NOT NULL
    AND (banned_until IS NULL OR banned_until<=now())) THEN RETURN false; END IF;
  SELECT source INTO acquired_source FROM public.entitlements WHERE user_id=p_user_id AND product_id=p_product_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public.product_downloads WHERE product_id=p_product_id AND enabled AND file_path=p_file_path FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF acquired_source='bundle' THEN
   SELECT CASE WHEN bool_or(r.source='purchase') THEN 'purchase' ELSE 'admin' END INTO acquired_source FROM public.entitlement_origins g JOIN public.entitlements r ON r.id=g.root_id WHERE r.user_id=p_user_id AND g.tool_id=p_product_id AND g.status='active';
  END IF;
  INSERT INTO public.product_download_events(id,product_id,source) VALUES(p_request_id,p_product_id,acquired_source)
    ON CONFLICT(id) DO NOTHING;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.freeze_product_members() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.capture_bundle_order_members() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.project_entitlement_origins() FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.delete_unused_product_draft(p_admin_id uuid,p_product_id bigint,p_expected_updated_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.products; dependency record; in_use boolean;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=p_admin_id
    AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501';
  END IF;
  -- Share the price setup lock; deletion cannot race an external catalog setup.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-price:'||p_product_id::text,0));
  SELECT * INTO item FROM public.products WHERE id=p_product_id FOR UPDATE;
  IF NOT FOUND OR item.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Draft changed' USING ERRCODE='40001';
  END IF;
  IF item.published OR item.initial_release_date IS NOT NULL OR item.release_date IS NOT NULL THEN
    RAISE EXCEPTION 'Previously released products cannot be deleted' USING ERRCODE='22023';
  END IF;
  -- Block every incoming reference except the draft's own artwork, download
  -- mapping and included-tool list. This also protects future commercial tables.
  FOR dependency IN
    SELECT c.conrelid::regclass AS relation,a.attname AS column_name
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
    WHERE c.contype='f' AND c.confrelid='public.products'::regclass
      AND c.conrelid NOT IN ('public.product_media'::regclass,'public.product_downloads'::regclass,'public.bundle_releases'::regclass)
      AND NOT(c.conrelid='public.product_members'::regclass AND a.attname='product_id')
  LOOP
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s WHERE %I=$1)',dependency.relation,dependency.column_name)
      INTO in_use USING p_product_id;
    IF in_use THEN RAISE EXCEPTION 'Draft has linked records' USING ERRCODE='22023'; END IF;
  END LOOP;
  DELETE FROM public.product_members WHERE product_id=p_product_id;
  DELETE FROM public.bundle_releases WHERE product_id=p_product_id;
  DELETE FROM public.product_downloads WHERE product_id=p_product_id;
  DELETE FROM public.product_media WHERE product_id=p_product_id;
  DELETE FROM public.products WHERE id=p_product_id;
  RETURN jsonb_build_object('id',p_product_id);
END $$;
REVOKE ALL ON FUNCTION public.delete_unused_product_draft(uuid,bigint,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_unused_product_draft(uuid,bigint,timestamptz) TO service_role;
COMMIT;
