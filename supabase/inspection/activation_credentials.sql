-- Read-only, no hashes or full keys returned. Execute query CONTENTS in the SQL editor.
SELECT r.role_name,
  has_column_privilege(r.role_name, 'public.account_activation_credentials', 'encrypted_key', 'SELECT') AS can_read_ciphertext,
  has_function_privilege(r.role_name, 'public.get_account_activation_secret(uuid,uuid)', 'EXECUTE') AS can_retrieve_encrypted_key,
  has_any_column_privilege(r.role_name, 'public.account_activation_credentials', 'SELECT') AS can_read_metadata,
  has_column_privilege(r.role_name, 'public.account_activation_credentials', 'secret_hash', 'SELECT') AS can_read_hash,
  has_any_column_privilege(r.role_name, 'public.account_activation_credentials', 'INSERT,UPDATE') AS can_write_directly,
  has_function_privilege(r.role_name, 'public.set_account_activation_credential(uuid,text,text,uuid,text)', 'EXECUTE') AS can_issue_key,
  has_function_privilege(r.role_name, 'public.activate_account_machine(text,text)', 'EXECUTE') AS can_activate
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) r(role_name);
-- anon/authenticated: all false. service_role: metadata/issue/activate/retrieve true, direct hash/ciphertext reads and writes false.
