BEGIN;
SET LOCAL lock_timeout = '5s';
-- Called only after the trusted server verifies an Ed25519-signed renewal proof.
-- This function never creates/reactivates assignments or changes ownership.
CREATE FUNCTION public.renew_account_license(p_activation_id bigint, p_credential_id uuid, p_machine_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  assignment public.account_activations%ROWTYPE;
  credential public.account_activation_credentials%ROWTYPE;
  owned_products jsonb;
  account_id uuid;
BEGIN
  SELECT user_id INTO account_id FROM public.account_activations WHERE id = p_activation_id;
  IF account_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'assignment_inactive');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-activation:' || account_id::text, 0));
  SELECT * INTO credential FROM public.account_activation_credentials WHERE user_id = account_id FOR SHARE;
  IF NOT FOUND OR credential.id IS DISTINCT FROM p_credential_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'credential_changed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = account_id
    AND email_confirmed_at IS NOT NULL AND (banned_until IS NULL OR banned_until <= now())) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'account_unavailable');
  END IF;
  SELECT * INTO assignment FROM public.account_activations WHERE id = p_activation_id FOR SHARE;
  IF NOT FOUND OR assignment.status <> 'active' OR assignment.machine_id IS DISTINCT FROM p_machine_id
    OR assignment.credential_id IS DISTINCT FROM p_credential_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'assignment_inactive');
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'slug', p.slug, 'name', p.name) ORDER BY p.id), '[]'::jsonb)
    INTO owned_products FROM public.entitlements e JOIN public.products p ON p.id = e.product_id
    WHERE e.user_id = account_id AND e.status = 'active';
  IF jsonb_array_length(owned_products) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_entitlements');
  END IF;
  RETURN jsonb_build_object('ok', true, 'activation', jsonb_build_object(
    'id', assignment.id, 'machine_id', assignment.machine_id, 'credential_id', assignment.credential_id,
    'activated_at', assignment.activated_at), 'products', owned_products);
END $$;
REVOKE ALL ON FUNCTION public.renew_account_license(bigint,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renew_account_license(bigint,uuid,text) TO service_role;
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.renew_account_license(bigint,uuid,text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.renew_account_license(bigint,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Browser roles must not execute privileged renewal';
  END IF;
END $$;
COMMIT;
