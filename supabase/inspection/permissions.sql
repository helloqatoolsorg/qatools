-- Read-only. Run before and after the permissions migration.
-- This returns permissions only, never customer rows or credentials.
WITH targets AS (
  SELECT unnest(ARRAY['account_activations', 'admin_users', 'category', 'complexity', 'entitlements', 'license_activations', 'order_items', 'orders', 'product_media', 'products', 'profiles']) AS table_name
), roles AS (
  SELECT unnest(ARRAY['anon', 'authenticated', 'service_role']) AS role_name
)
SELECT r.role_name, t.table_name, c.relrowsecurity AS rls_enabled,
  has_table_privilege(r.role_name, c.oid, 'SELECT') AS can_select,
  has_table_privilege(r.role_name, c.oid, 'INSERT') AS can_insert,
  has_table_privilege(r.role_name, c.oid, 'UPDATE') AS can_update,
  has_table_privilege(r.role_name, c.oid, 'DELETE') AS can_delete,
  has_table_privilege(r.role_name, c.oid, 'TRUNCATE') AS can_truncate,
  has_table_privilege(r.role_name, c.oid, 'REFERENCES') AS can_reference,
  has_table_privilege(r.role_name, c.oid, 'TRIGGER') AS can_trigger,
  has_table_privilege(r.role_name, c.oid, 'MAINTAIN') AS can_maintain
FROM targets t
JOIN pg_class c ON c.oid = to_regclass('public.' || t.table_name)
CROSS JOIN roles r
ORDER BY r.role_name, t.table_name;

-- Also inspect global defaults: per-schema revokes cannot override them.
SELECT pg_get_userbyid(d.defaclrole) AS creator_role,
  CASE WHEN d.defaclnamespace = 0 THEN '(global)' ELSE n.nspname END AS schema_name,
  CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
  a.privilege_type, a.is_grantable
FROM pg_default_acl d
LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
CROSS JOIN LATERAL aclexplode(d.defaclacl) a
WHERE d.defaclobjtype = 'r'
  AND (d.defaclnamespace = 0 OR n.nspname = 'public')
ORDER BY creator_role, schema_name, grantee, privilege_type;
