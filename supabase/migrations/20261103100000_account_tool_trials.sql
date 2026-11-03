-- Deploy with the versioned account-trial website and Houdini runtime batch.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE public.account_trials (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 started_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 CHECK (ends_at = started_at + interval '168 hours')
);
ALTER TABLE public.account_trials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_trials FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.account_trials TO service_role;
-- Called inside the future trial-capable activation transaction, never during renewal.
CREATE FUNCTION public.start_account_trial(p_activation_id bigint,p_credential_id uuid,p_machine_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE account_id uuid; trial public.account_trials%ROWTYPE; started timestamptz;
BEGIN
 SELECT user_id INTO account_id FROM public.account_activations WHERE id=p_activation_id;
 IF account_id IS NULL THEN RETURN NULL; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-activation:' || account_id::text,0));
 IF NOT EXISTS(SELECT 1 FROM public.account_activations a
 JOIN public.account_activation_credentials c ON c.user_id=a.user_id AND c.id=a.credential_id
 JOIN auth.users u ON u.id=a.user_id
 WHERE a.id=p_activation_id AND a.status='active' AND a.machine_id=p_machine_id
 AND c.id=p_credential_id AND u.email_confirmed_at IS NOT NULL
 AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN RETURN NULL; END IF;
 started := clock_timestamp();
 INSERT INTO public.account_trials(user_id,started_at,ends_at)
 VALUES(account_id,started,started+interval '168 hours') ON CONFLICT(user_id) DO NOTHING;
 SELECT * INTO trial FROM public.account_trials WHERE user_id=account_id;
 RETURN jsonb_build_object('startedAt',floor(extract(epoch FROM trial.started_at)),
 'endsAt',floor(extract(epoch FROM trial.ends_at)));
END $$;
REVOKE ALL ON FUNCTION public.start_account_trial(bigint,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
-- No application EXECUTE grant: activation wrapper must call this atomically.

CREATE OR REPLACE FUNCTION public.set_account_activation_credential(
  p_user_id uuid, p_secret_hash text, p_key_prefix text, p_expected_id uuid, p_encrypted_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  existing public.account_activation_credentials%ROWTYPE;
  saved public.account_activation_credentials%ROWTYPE;
BEGIN
  IF p_encrypted_key IS NULL OR p_encrypted_key !~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{62}$' THEN
    RAISE EXCEPTION 'Encrypted credential required';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-activation:' || p_user_id::text, 0));
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id
    AND email_confirmed_at IS NOT NULL AND (banned_until IS NULL OR banned_until <= now())) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'account_unavailable');
  END IF;
  SELECT * INTO existing FROM public.account_activation_credentials WHERE user_id = p_user_id FOR UPDATE;
  -- Compare-and-set prevents duplicate requests/tabs from silently replacing a key.
  IF existing.id IS DISTINCT FROM p_expected_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'credential_changed');
  END IF;
  INSERT INTO public.account_activation_credentials(user_id, secret_hash, key_prefix, encrypted_key)
  VALUES (p_user_id, p_secret_hash, p_key_prefix, p_encrypted_key)
  ON CONFLICT (user_id) DO UPDATE SET
    id = gen_random_uuid(), secret_hash = EXCLUDED.secret_hash,
    key_prefix = EXCLUDED.key_prefix, encrypted_key = EXCLUDED.encrypted_key, updated_at = now()
  RETURNING * INTO saved;
  RETURN jsonb_build_object('ok', true, 'credential', jsonb_build_object(
    'id', saved.id, 'key_prefix', saved.key_prefix, 'created_at', saved.created_at, 'updated_at', saved.updated_at, 'reveal_available', saved.reveal_available));
END $$;



CREATE FUNCTION public.activate_trial_machine(p_secret_hash text, p_machine_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  account_id uuid;
  credential public.account_activation_credentials%ROWTYPE;
  assignment public.account_activations%ROWTYPE;
  owned_products jsonb;
BEGIN
  IF p_machine_id IS NULL OR p_machine_id !~ '^[A-F0-9]{16}$' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_machine');
  END IF;
  SELECT user_id INTO account_id FROM public.account_activation_credentials WHERE secret_hash = p_secret_hash;
  IF account_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_credential');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-activation:' || account_id::text, 0));
  -- Recheck after locking: a concurrent replacement may have invalidated the credential.
  SELECT * INTO credential FROM public.account_activation_credentials
    WHERE user_id = account_id AND secret_hash = p_secret_hash FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = account_id
    AND email_confirmed_at IS NOT NULL AND (banned_until IS NULL OR banned_until <= now())) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_credential');
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'slug', p.slug, 'name', p.name) ORDER BY p.id), '[]'::jsonb)
    INTO owned_products FROM public.entitlements e JOIN public.products p ON p.id = e.product_id
    WHERE e.user_id = account_id AND e.status = 'active';
  SELECT * INTO assignment FROM public.account_activations
    WHERE user_id = account_id AND status = 'active' FOR UPDATE;
  IF FOUND THEN
    IF assignment.machine_id <> p_machine_id THEN
      RETURN jsonb_build_object('ok', false, 'code', 'machine_in_use');
    END IF;
    IF assignment.credential_id IS DISTINCT FROM credential.id THEN
      UPDATE public.account_activations SET credential_id = credential.id
        WHERE id = assignment.id RETURNING * INTO assignment;
    END IF;
  ELSE
    INSERT INTO public.account_activations(user_id, machine_id, credential_id)
      VALUES (account_id, p_machine_id, credential.id) RETURNING * INTO assignment;
  END IF;
  PERFORM public.start_account_trial(assignment.id,credential.id,p_machine_id);
  RETURN jsonb_build_object('ok', true, 'activation', jsonb_build_object(
    'id', assignment.id, 'machine_id', assignment.machine_id, 'credential_id', assignment.credential_id,
    'activated_at', assignment.activated_at), 'products', owned_products);
END $$;


REVOKE ALL ON FUNCTION public.activate_trial_machine(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_trial_machine(text,text) TO service_role;
CREATE FUNCTION public.read_trial_license(p_activation_id bigint,p_credential_id uuid,p_machine_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.account_activations%ROWTYPE; t public.account_trials%ROWTYPE; owned jsonb; freebies jsonb; demos jsonb;
BEGIN
 SELECT * INTO a FROM public.account_activations WHERE id=p_activation_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','assignment_inactive'); END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-activation:'||a.user_id::text,0));
 SELECT * INTO a FROM public.account_activations WHERE id=p_activation_id;
 IF a.status<>'active' OR a.machine_id IS DISTINCT FROM p_machine_id OR a.credential_id IS DISTINCT FROM p_credential_id THEN RETURN jsonb_build_object('ok',false,'code','assignment_inactive'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.account_activation_credentials WHERE user_id=a.user_id AND id=p_credential_id) THEN RETURN jsonb_build_object('ok',false,'code','credential_changed'); END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=a.user_id AND email_confirmed_at IS NOT NULL AND (banned_until IS NULL OR banned_until<=now())) THEN RETURN jsonb_build_object('ok',false,'code','account_unavailable'); END IF;
 SELECT * INTO t FROM public.account_trials WHERE user_id=a.user_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','activation_required'); END IF;
 SELECT coalesce(jsonb_agg(p.slug ORDER BY p.slug),'[]') INTO owned FROM public.products p WHERE p.product_type='tool' AND EXISTS(SELECT 1 FROM public.entitlements e WHERE e.user_id=a.user_id AND e.product_id=p.id AND e.status='active');
 SELECT coalesce(jsonb_agg(p.slug ORDER BY p.slug),'[]') INTO freebies FROM public.products p WHERE p.published AND p.product_type='tool' AND p.price_eur=0;
 SELECT coalesce(jsonb_agg(p.slug ORDER BY p.slug),'[]') INTO demos FROM public.products p WHERE p.published AND p.product_type='tool' AND p.price_eur>0;
 RETURN jsonb_build_object('ok',true,'activation',jsonb_build_object('id',a.id,'machine_id',a.machine_id,'credential_id',a.credential_id,'activated_at',a.activated_at),'purchased',owned,'free',freebies,'trial',demos,'trialStartedAt',floor(extract(epoch FROM t.started_at)),'trialEndsAt',floor(extract(epoch FROM t.ends_at)));
END $$;
REVOKE ALL ON FUNCTION public.read_trial_license(bigint,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_trial_license(bigint,uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.record_product_download(p_request_id uuid,p_user_id uuid,p_product_id bigint,p_file_path text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE acquired_source text;
BEGIN
 IF p_request_id IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id AND email_confirmed_at IS NOT NULL AND (banned_until IS NULL OR banned_until<=now())) THEN RETURN false; END IF;
 SELECT source INTO acquired_source FROM public.entitlements WHERE user_id=p_user_id AND product_id=p_product_id AND status='active' FOR SHARE;
 IF NOT FOUND THEN
  PERFORM 1 FROM public.products WHERE id=p_product_id AND published AND product_type IN ('tool','bundle') FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  acquired_source := 'free'; -- Unpaid download, not a commercial entitlement or trial start.
 END IF;
 PERFORM 1 FROM public.product_downloads WHERE product_id=p_product_id AND enabled AND file_path=p_file_path FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF acquired_source='bundle' THEN
  SELECT CASE WHEN bool_or(r.source='purchase') THEN 'purchase' ELSE 'admin' END INTO acquired_source FROM public.entitlement_origins g JOIN public.entitlements r ON r.id=g.root_id WHERE r.user_id=p_user_id AND g.tool_id=p_product_id AND g.status='active';
 END IF;
 INSERT INTO public.product_download_events(id,product_id,source) VALUES(p_request_id,p_product_id,acquired_source) ON CONFLICT(id) DO NOTHING;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.record_product_download(uuid,uuid,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_product_download(uuid,uuid,bigint,text) TO service_role;
CREATE FUNCTION public.read_account_trial(p_user_id uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('startedAt',started_at,'endsAt',ends_at) FROM public.account_trials WHERE user_id=p_user_id;
$$;
REVOKE ALL ON FUNCTION public.read_account_trial(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_account_trial(uuid) TO service_role;
COMMIT;
