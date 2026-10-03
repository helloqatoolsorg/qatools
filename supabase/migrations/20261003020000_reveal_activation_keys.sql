BEGIN;
SET LOCAL lock_timeout = '5s';
-- Preserve legacy hashes and assignments. A missing ciphertext requires one explicit replacement.
ALTER TABLE public.account_activation_credentials
  ADD COLUMN encrypted_key text CHECK (encrypted_key ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{62}$'),
  ADD COLUMN reveal_available boolean GENERATED ALWAYS AS (encrypted_key IS NOT NULL) STORED;
GRANT SELECT(reveal_available) ON public.account_activation_credentials TO service_role;
COMMENT ON COLUMN public.account_activation_credentials.encrypted_key IS
  'Versioned AES-256-GCM envelope; server encryption key is stored separately. Never expose this column to browser roles.';
-- Remove the hash-only writer; new creations must include ciphertext atomically.
DROP FUNCTION public.set_account_activation_credential(uuid,text,text,uuid);
CREATE FUNCTION public.set_account_activation_credential(
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
  IF NOT EXISTS (SELECT 1 FROM public.entitlements WHERE user_id = p_user_id AND status = 'active') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_entitlements');
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


CREATE FUNCTION public.get_account_activation_secret(p_user_id uuid, p_expected_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE saved public.account_activation_credentials%ROWTYPE;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-activation:' || p_user_id::text, 0));
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id
    AND email_confirmed_at IS NOT NULL AND (banned_until IS NULL OR banned_until <= now())) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'account_unavailable');
  END IF;
  SELECT * INTO saved FROM public.account_activation_credentials WHERE user_id = p_user_id;
  IF NOT FOUND OR saved.id IS DISTINCT FROM p_expected_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'credential_changed');
  END IF;
  IF saved.encrypted_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'legacy_key');
  END IF;
  RETURN jsonb_build_object('ok', true, 'encrypted_key', saved.encrypted_key, 'secret_hash', saved.secret_hash);
END $$;
REVOKE ALL ON FUNCTION public.set_account_activation_credential(uuid,text,text,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_account_activation_secret(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_account_activation_credential(uuid,text,text,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_account_activation_secret(uuid,uuid) TO service_role;
DO $$
DECLARE browser_role text;
BEGIN
  FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_any_column_privilege(browser_role, 'public.account_activation_credentials', 'SELECT,INSERT,UPDATE,REFERENCES')
      OR has_function_privilege(browser_role, 'public.set_account_activation_credential(uuid,text,text,uuid,text)', 'EXECUTE')
      OR has_function_privilege(browser_role, 'public.get_account_activation_secret(uuid,uuid)', 'EXECUTE') THEN
      RAISE EXCEPTION 'Browser roles must not access encrypted credentials';
    END IF;
  END LOOP;
  IF has_column_privilege('service_role', 'public.account_activation_credentials', 'encrypted_key', 'SELECT')
    OR has_column_privilege('service_role', 'public.account_activation_credentials', 'secret_hash', 'SELECT') THEN
    RAISE EXCEPTION 'Direct encrypted credential and hash reads must remain disabled';
  END IF;
END $$;
COMMIT;
