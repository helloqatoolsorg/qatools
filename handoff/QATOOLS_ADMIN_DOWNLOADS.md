# Admin tool-download management — 2026-10-03

Prepared locally; remote migration and authenticated admin upload/toggle testing remain pending. Owner confirmed the installed OpenSSL-warning fix works after restarting Houdini. Owner also reported applying the previous test-package mapping update; no independent remote mapping check in this step.

## Admin workflow

Apply 20261003070000_admin_product_downloads.sql using supabase db push, then log in with an existing admin account and open /admin. Tool downloads appears below Orders. Choose an existing item to load its current download. Select a ZIP up to 25 MB and use UPLOAD & ENABLE or UPLOAD REPLACEMENT. Existing owners will receive the enabled package. ENABLE DOWNLOAD / DISABLE DOWNLOAD controls future link issuance without altering ownership or machine activation. Disabled downloads do not revoke licenses; existing signed links remain valid until their two-minute expiry.

Uploads require a simple ASCII filename, ending in .zip (letters, digits, dots, underscores and hyphens). ZIP directory checks reject broken directory structures, unsafe/traversal paths, symlinks, encrypted entries and obvious private configuration/runtime filenames. These checks do not scan for malware, validate every payload CRC, detect every possible secret, certify product compatibility or establish production packaging readiness. Review/test the release before uploading. Current limits: ZIP only, 25 MB compressed maximum, 1,000 directory entries, no ZIP64/multi-disk archives. A larger/multi-platform release workflow is separate future work.

## Trust boundaries

- Each GET, POST and PATCH independently calls requireAdmin: authenticated Supabase getUser plus admin_users membership. Every response is no-store. Browser UI gating is not authorization.
- POST uses bounded streaming reads without trusting Content-Length; server validates the selected product and expected current path before processing upload. The bucket must remain private.
- Files use product-ID/random-UUID/filename paths and upsert=false; existing releases are never overwritten or deleted.
- SQL function set_product_download is executable only by service_role, checks admin membership again, locks the selected product/mapping and serializes API saves by product. It checks expected-path freshness and private object existence before enabling. Conditional conflict-update protects the mapping from a concurrent manual insertion. No new browser table/storage privileges or service direct table-write privileges are granted.
- The authenticated admin ID comes from getUser, never the request. Browser cannot provide a new storage object path; server derives it.
- Storage upload and database save are separate operations. On a failed/conflicting save, the new unreferenced private object can remain; current mapping is retained. Retry after refreshing. Orphan cleanup, old-release rollback selection and a full release audit/history interface remain future work. Parallel production load was not tested.

## Verification

Production build passed. Ten new checks and eight existing customer-download checks passed. Covers authorization for all three methods, request/size/archive validation, trusted identity/new paths/no overwrite, explicit enable/disable, conflicts/failures, and actual SQL function/migration behavior under isolated PostgreSQL roles. Real development ZIP accepted; synthetic malicious directory paths/private filenames rejected. SQL tests verify non-admin denial, service-only execution, no direct table-write grants, private/object-existence checks, toggles, replacements and stale saves; retained objects are not deleted.

Actual local anonymous GET/POST/PATCH all returned 401/no-store. Current logged-in test customer reached Access unavailable on /admin, as expected; real admin controls and remote mutation flows were not tested. No live storage objects, file mappings, entitlements, credentials or machine assignments changed in this step.

## Files

- supabase/migrations/20261003070000_admin_product_downloads.sql
- src/app/api/admin/downloads/route.ts
- src/lib/adminDownloadUpload.ts
- src/components/AdminDownloads.tsx and AdminDownloads.css
- src/app/admin/page.tsx
- src/lib/database.types.ts
- tests/admin-downloads.test.cjs

This records implementation under the owner's authorization to continue routine store work. No new commercial/licensing promise is adopted.

Duplicate-key correction: the new Orders and Tool downloads siblings both used key={user.id}, causing React's duplicate-key warning. Corrected to distinct orders- and downloads- prefixes while preserving account-dependent remounting. TypeScript checking passed. Production build attempt could not write .next/trace under the current filesystem permissions. Fresh unauthenticated admin browser check showed no console warnings; authenticated rendering still requires the owner's admin session.
