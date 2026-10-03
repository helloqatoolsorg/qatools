BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE public.account_activation_credentials (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  secret_hash text NOT NULL UNIQUE CHECK (secret_hash ~ '^[0-9a-f]{64}$'),
  key_prefix text NOT NULL CHECK (key_prefix ~ '^QA_[A-Za-z0-9_-]{8}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.account_activation_credentials ENABLE ROW LEVEL SECURITY;
-- No browser policies or direct secret-hash read grants. Raw credentials never enter SQL.
REVOKE ALL ON public.account_activation_credentials FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT(user_id, id, key_prefix, created_at, updated_at)
  ON public.account_activation_credentials TO service_role;

-- Historical generation ID, deliberately not an FK: rotation must preserve history.
ALTER TABLE public.account_activations ADD COLUMN credential_id uuid;
COMMENT ON COLUMN public.account_activations.credential_id IS
  'Credential generation used for this assignment. NULL on imported legacy assignments. Renewal must match the current generation and active assignment.';

CREATE FUNCTION public.set_account_activation_credential(
  p_user_id uuid, p_secret_hash text, p_key_prefix text, p_expected_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  existing public.account_activation_credentials%ROWTYPE;
  saved public.account_activation_credentials%ROWTYPE;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-activation:' || p_user_id::text, 0));
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id
    AND email_confirmed_at IS NOT NULL AND (banned_until IS NULL OR banned_until <= now())) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'account_unavailable');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.entitlements WHERE user_id = p_user_id AND status = 'active') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_entitlements');
  END IF;
  SELECT * INTO existing FROM public.account_activation_credentials WHERE user_id = p_user_id FOR UPDATE;
  -- Compare-and-set prevents duplicate requests/tabs from silently replacing a key.
  IF existing.id IS DISTINCT FROM p_expected_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'credential_changed');
  END IF;
  INSERT INTO public.account_activation_credentials(user_id, secret_hash, key_prefix)
  VALUES (p_user_id, p_secret_hash, p_key_prefix)
  ON CONFLICT (user_id) DO UPDATE SET
    id = gen_random_uuid(), secret_hash = EXCLUDED.secret_hash,
    key_prefix = EXCLUDED.key_prefix, updated_at = now()
  RETURNING * INTO saved;
  RETURN jsonb_build_object('ok', true, 'credential', jsonb_build_object(
    'id', saved.id, 'key_prefix', saved.key_prefix, 'created_at', saved.created_at, 'updated_at', saved.updated_at));
END $$;

CREATE FUNCTION public.activate_account_machine(p_secret_hash text, p_machine_id text)
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
  IF jsonb_array_length(owned_products) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_entitlements');
  END IF;
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
  RETURN jsonb_build_object('ok', true, 'activation', jsonb_build_object(
    'id', assignment.id, 'machine_id', assignment.machine_id, 'credential_id', assignment.credential_id,
    'activated_at', assignment.activated_at), 'products', owned_products);
END $$;

REVOKE ALL ON FUNCTION public.set_account_activation_credential(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activate_account_machine(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_account_activation_credential(uuid, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.activate_account_machine(text, text) TO service_role;

DO $$
DECLARE browser_role text;
BEGIN
  FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_any_column_privilege(browser_role, 'public.account_activation_credentials', 'SELECT,INSERT,UPDATE,REFERENCES')
      OR has_table_privilege(browser_role, 'public.account_activation_credentials', 'DELETE,TRUNCATE,TRIGGER,MAINTAIN')
      OR has_function_privilege(browser_role, 'public.set_account_activation_credential(uuid,text,text,uuid)', 'EXECUTE')
      OR has_function_privilege(browser_role, 'public.activate_account_machine(text,text)', 'EXECUTE') THEN
      RAISE EXCEPTION 'Browser roles must not access activation credentials or privileged activation functions';
    END IF;
  END LOOP;
  IF has_column_privilege('service_role', 'public.account_activation_credentials', 'secret_hash', 'SELECT') THEN
    RAISE EXCEPTION 'Direct credential hash reads must remain disabled';
  END IF;
END $$;
COMMIT;
