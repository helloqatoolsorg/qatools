BEGIN;

CREATE FUNCTION public.read_admin_dashboard_counts(p_admin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  download_counts jsonb;
BEGIN
  -- Reuse the existing admin check and download-count definition.
  download_counts := public.read_admin_download_counts(p_admin_id);

  RETURN jsonb_build_object(
    'downloads', download_counts -> 'total',
    'users', (SELECT count(*) FROM auth.users),
    'paidToolActivations', (
      SELECT count(*)
      FROM public.account_activations AS activation
      JOIN auth.users AS account ON account.id = activation.user_id
      JOIN public.entitlements AS entitlement ON entitlement.user_id = activation.user_id
      JOIN public.products AS product ON product.id = entitlement.product_id
      WHERE activation.status = 'active'
        AND account.email_confirmed_at IS NOT NULL
        AND (account.banned_until IS NULL OR account.banned_until <= now())
        AND entitlement.status = 'active'
        AND product.product_type = 'tool'
        AND product.price_eur > 0
        AND EXISTS (
          SELECT 1
          FROM public.entitlement_origins AS origin
          JOIN public.entitlements AS purchase ON purchase.id = origin.root_id
          WHERE origin.tool_id = entitlement.product_id
            AND origin.status = 'active'
            AND purchase.user_id = account.id
            AND purchase.status = 'active'
            AND purchase.source = 'purchase'
        )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.read_admin_dashboard_counts(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_admin_dashboard_counts(uuid) TO service_role;

COMMIT;
