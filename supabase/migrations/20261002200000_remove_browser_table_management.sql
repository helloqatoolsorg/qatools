-- Remove unnecessary table-management privileges from browser roles.
-- No row data, RLS policies, service_role grants, or Auth/Storage objects change.
-- Reviewed against baseline 20261002172027. Confirm live audit before applying.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE
  public.admin_users,
  public.category,
  public.complexity,
  public.entitlements,
  public.license_activations,
  public.order_items,
  public.orders,
  public.product_media,
  public.products,
  public.profiles
FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES FROM anon, authenticated;

-- Fail closed on drift or inherited grants instead of silently reporting success.
DO $permissions$
DECLARE
  table_name text;
  browser_role text;
  privilege_name text;
  relation_id regclass;
  expected_select boolean;
  expected_update boolean;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['admin_users', 'category', 'complexity', 'entitlements', 'license_activations', 'order_items', 'orders', 'product_media', 'products', 'profiles'] LOOP
    relation_id := to_regclass('public.' || table_name);
    IF relation_id IS NULL OR NOT (
      SELECT relrowsecurity FROM pg_class WHERE oid = relation_id
    ) THEN
      RAISE EXCEPTION 'Missing table or disabled RLS: public.%', table_name;
    END IF;
    FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      FOREACH privilege_name IN ARRAY ARRAY['TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN', 'INSERT', 'DELETE'] LOOP
        IF has_table_privilege(browser_role, relation_id, privilege_name) THEN
          RAISE EXCEPTION 'Unexpected effective grant: % % public.%', browser_role, privilege_name, table_name;
        END IF;
      END LOOP;
      expected_select := browser_role = 'authenticated'
        OR table_name = ANY (ARRAY['category', 'complexity', 'products', 'product_media']);
      expected_update := browser_role = 'authenticated' AND table_name = 'profiles';
      IF has_table_privilege(browser_role, relation_id, 'SELECT') IS DISTINCT FROM expected_select
        OR has_table_privilege(browser_role, relation_id, 'UPDATE') IS DISTINCT FROM expected_update THEN
        RAISE EXCEPTION 'Unexpected read/update grant: % public.%', browser_role, table_name;
      END IF;
      IF has_any_column_privilege(browser_role, relation_id, 'INSERT')
        OR (NOT expected_update AND has_any_column_privilege(browser_role, relation_id, 'UPDATE'))
        OR has_any_column_privilege(browser_role, relation_id, 'REFERENCES') THEN
        RAISE EXCEPTION 'Unexpected column-level write/reference grant: % public.%', browser_role, table_name;
      END IF;
    END LOOP;
  END LOOP;

  FOREACH table_name IN ARRAY ARRAY['admin_users', 'profiles', 'entitlements', 'license_activations', 'products'] LOOP
    IF NOT has_table_privilege('service_role', to_regclass('public.' || table_name), 'SELECT') THEN
      RAISE EXCEPTION 'Admin service-role read access missing: public.%', table_name;
    END IF;
  END LOOP;
  IF NOT has_table_privilege('service_role', 'public.entitlements', 'INSERT') THEN
    RAISE EXCEPTION 'Admin entitlement insertion permission missing';
  END IF;

  -- Include inherited role grants and PUBLIC. Defaults for other creators
  -- are reported by inspection/permissions.sql but are outside this change.
  IF EXISTS (
    SELECT 1 FROM pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE d.defaclrole = 'postgres'::regrole AND d.defaclobjtype = 'r'
      AND d.defaclnamespace IN (0, 'public'::regnamespace::oid)
      AND a.privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN')
      AND CASE WHEN a.grantee = 0 THEN true ELSE
        pg_has_role('anon', a.grantee, 'USAGE') OR pg_has_role('authenticated', a.grantee, 'USAGE') END
  ) THEN
    RAISE EXCEPTION 'Unsafe inherited/global table defaults remain; inspect defaults before proceeding';
  END IF;
END;
$permissions$;

COMMIT;
