-- Read-only verification after 20261002220000_account_machine_activations.
-- Run each SELECT separately in the SQL editor to see every result.
SELECT r.role_name, c.relrowsecurity AS rls_enabled,
  has_table_privilege(r.role_name, c.oid, 'SELECT') AS can_select,
  has_any_column_privilege(r.role_name, c.oid, 'INSERT') AS can_insert,
  has_any_column_privilege(r.role_name, c.oid, 'UPDATE') AS can_update_any_column,
  has_column_privilege(r.role_name, c.oid, 'machine_id', 'UPDATE') AS can_change_machine_id,
  has_table_privilege(r.role_name, c.oid, 'DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') AS has_management_privileges
FROM pg_class c CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) r(role_name)
WHERE c.oid = to_regclass('public.account_activations');
-- Expected: RLS true for all. anon all capabilities false; authenticated SELECT only;
-- service_role SELECT and can_update_any_column only, never machine_id or management.

SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'account_activations';
-- Must include UNIQUE user_id WHERE status = 'active'.

SELECT policyname, roles, cmd, qual FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'account_activations';
-- One SELECT policy: authenticated can read their own user_id only.

SELECT count(*) AS account_history_rows,
  count(*) FILTER (WHERE status = 'active') AS active_account_machines
FROM public.account_activations;
SELECT count(*) AS preserved_legacy_rows FROM public.license_activations;
