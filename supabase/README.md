# Database source files

The schema baseline is migrations/20261002172027_remote_schema.sql, exported on 2026-10-02 and reported by the owner as marked applied in remote migration history. Do not reapply or edit this baseline to make future changes; add a new migration.

- inspection/complexity.sql: optional read-only inspection query.
- migrations/: exported baseline followed by future reviewed migrations.
- historical/: original SQL Editor scripts, if available; reference only.

The baseline includes public tables, constraints, indexes, functions, grants, RLS policies and the signup trigger on auth.users. It is a schema snapshot, not a backup of rows or Storage files. Storage configuration/policies have not been verified from this export.

The owner confirmed complexity rows: easy, medium, difficult, advanced (IDs and sort orders 1–4; all active). No complexity migration is needed.

src/lib/database.types.ts contains table types derived from this baseline, including public foreign-key relationships. Keep it synchronized with migrations; Supabase CLI type generation can replace it when authenticated CLI access is available. Trigger-only functions are not modeled as callable RPCs.

The baseline records historical browser-role privileges; migration 20261002200000 removes the four extra table-management privileges. Broader supabase_admin-created public table defaults remain a separate outstanding review. Do not commit credentials or customer data.

## Browser table-management privileges

Applied migration: migrations/20261002200000_remove_browser_table_management.sql. The owner reported successful supabase db push and supplied post-migration SQL results on 2026-10-02: all 20 browser-role/table combinations have TRUNCATE, REFERENCES, TRIGGER and MAINTAIN = false. The supplied default-grants audit also confirms their removal from postgres-created public table defaults.

The owner supplied the pre-migration live audit from inspection/permissions.sql. For future checks, run that file against the hosted project. It reports effective grants (including inherited privileges) and table defaults without exposing customer data. Review both result sets against the exported baseline.

The migration revokes TRUNCATE, REFERENCES, TRIGGER and MAINTAIN from anon/authenticated on the ten existing public application tables and from postgres-created public table defaults. It preserves SELECT, profile UPDATE, existing RLS policies, service_role and all data. Transactional assertions reject unexpected effective browser writes, missing required access, disabled RLS and remaining unsafe postgres defaults. Any assertion failure rolls back the migration. No broad CASCADE revokes are used.

Do not rerun or edit the applied migrations. The owner subsequently reported that the requested post-migration website checks all work. The migration assertions passed during application; the agent did not independently execute live SQL.

This is a focused grant cleanup, not a full database security audit. Auth/Storage policies, RPC exposure and default privileges for other object creators remain separate review areas.

## Admin activation release

Migration 20261002210000_admin_activation_release.sql is APPLIED; the owner reported successful supabase db push. It adds nullable released_by referencing auth.users (ON DELETE SET NULL) and grants service_role column-only UPDATE on status, released_at, released_by. Browser write permissions stay disabled. The existing updated_at trigger and unique-active-activation index are preserved.

Apply this migration before using the updated admin customer list: it now selects released_by. From the project terminal, run supabase db push --dry-run, verify this is the only pending migration, then supabase db push. Do not reapply the historical baseline or permission cleanup.

After applying: open /admin, expand a customer with a development activation, select RELEASE MACHINE, review the machine/product and confirm. Expected: no active machine, same entitlement retained, history row now RELEASED with release time and admin ID. Refresh to verify persistence. Do not use a real customer activation as disposable test data.

The release endpoint performs an atomic update only where status is active; repeated/stale requests return 409. This changes the database slot only; the separate FastAPI/Houdini prototype is not yet entitlement-backed, and cached perpetual licenses cannot be remotely disabled by this operation.

Validation: npm run build and node --test tests/admin-routes.test.cjs passed (18 tests). Local HTTP checks returned 401 for all three unauthenticated admin endpoints. Tests use mocked database calls; database migration and authenticated release require live verification.


### Live activation-release verification — 2026-10-02

The owner reported successful application of migration 20261002210000 and a successful release of development machine DEV-MACHINE-QAFIT01-001 for qafit01. Subsequent supplied UI text shows ownership ACTIVE, source ADMIN, NOT ACTIVATED, and Activation history (1) retaining the machine as RELEASED. Displayed timestamps: activated 01/10/2026 18:29:37; released 02/10/2026 20:43:53. This supersedes the earlier pending deployment/release status. The supplied history excerpt does not include released_by, so display/persistence of the admin ID has not been independently verified. No production customer activation was used for this test.
