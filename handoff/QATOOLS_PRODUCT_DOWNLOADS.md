# Secure product downloads — 2026-10-03

Implemented locally as the next standard store step. Remote migration, actual tool uploads and a complete authenticated file download remain pending. No live file or product mapping was invented or uploaded.

## Implementation

- Owned-item details contain a DOWNLOAD button. A missing enabled release produces an explicit unavailable message after the migration is applied.
- POST /api/account/download verifies the authenticated, email-confirmed user, validates a bounded numeric product ID, checks that user's active entitlement, and selects an enabled product_downloads mapping using the server-only service client.
- The browser cannot select a file path, bucket or another user. The route refuses a public/missing bucket and returns only a 120-second signed attachment URL with no-store. Signed links are bearer access until expiry: they can be shared and a subsequent ownership revocation does not invalidate an already issued link immediately. This does not change Houdini licensing checks.
- New product_downloads table: one current release per product; product_id, file_path, file_name, enabled (false by default), created_at. No browser access or new commercial write grants. The service role receives SELECT only.
- New qatools-downloads bucket is private. Migration aborts if an existing bucket with that ID is public. A restrictive storage.objects policy blocks browser reads/writes for this bucket even if another policy broadly allows objects. Preview media policies stay otherwise unchanged. The route also checks bucket privacy before signing; do not make this bucket public later.
- Existing owners can download their mapped release even when a product is subsequently unpublished from the storefront. Revoked/refunded entitlements cannot obtain new links. Product version/Houdini version do not affect machine activation.
- Release management is currently through the Supabase dashboard. A no-code website admin release uploader, multiple versions/platform selection and automatic packaging remain future work.

## Setup after migration

1. Run supabase db push from D:\qatools\qatools; apply 20261003060000_secure_product_downloads.sql.
2. In Supabase Storage, confirm qatools-downloads is private. Upload the actual intended item release there. Keep signing keys, activation encryption secrets, .env files and server code out of packages. The existing development Houdini ZIP is a test package, not a verified public release.
3. In Table Editor, find the actual product ID in products. Add a product_downloads row using that ID, the exact uploaded object path (without a bucket prefix), an attachment file_name, and enabled=true only when ready. Use a distinct immutable path per release; do not overwrite an object while distributing it.
4. Log in as an active owner, expand that item under Purchased Products and click DOWNLOAD. Verify the downloaded file. A different account without ownership must receive no URL; a missing release should show the unavailable message. Do not share signed URLs in support logs.

Example field shapes only: file_path=item-slug/1.0/item-release.zip, file_name=item-release.zip. These are not real file mappings and were not inserted.

## Verification

Production build passed. Eight checks passed: missing/invalid/unconfirmed login, invalid/oversized requests, inactive ownership, trusted identity/mapping and link lifetime, safe missing-release/query/storage errors, and actual migration privilege/path/RLS behavior in isolated PostgreSQL (PGlite). The restrictive policy was tested against a deliberately permissive existing storage policy. Live anonymous POST returned 401/no-store. Tests do not prove a real hosted file can be downloaded; that requires migration, upload and mapping.

## Changed files

- supabase/migrations/20261003060000_secure_product_downloads.sql
- src/app/api/account/download/route.ts
- src/components/ProductDownload.tsx
- src/app/user/page.tsx
- src/lib/database.types.ts
- tests/downloads.test.cjs

This record describes implementation, not a published contract or new licensing promise. Signed URL behavior follows the Supabase createSignedUrl documentation: https://supabase.com/docs/reference/javascript/file-buckets-createsignedurl

## Remote test package preparation — 2026-10-03

Read-only remote checks confirmed the private qatools-downloads bucket and accessible product_downloads table; no mappings existed. This verifies the deployed schema/bucket state without inspecting migration-history rows. The existing qafit01 development ZIP's HDA and Python files matched current repository source. Its eight-entry manifest contains the HDA, public client modules/startup and package JSON, without server credentials or cached licenses.

Uploaded the 22,401-byte ZIP to private storage at qafit01/dev/a8c6aafb51f8b06587d36262eb176c91409419eeec2b5e373036701496bb8e1f/qatools-houdini22-dev.zip (immutable hash path, no overwrite). A real signed-URL download returned bytes matching SHA-256 a8c6aafb51f8b06587d36262eb176c91409419eeec2b5e373036701496bb8e1f. No signed link or credentials were printed.

Actual qafit01 product ID is 1. Mapping not inserted: service role has SELECT only on product_downloads by design. Exact owner SQL Editor setup is saved in handoff/qafit01_dev_download.sql; it preserves existing mappings. Owner application and website button download verification remain pending.

This is development delivery testing only, for Houdini 22.0/Python 3.13 with localhost backend. Upload does not certify a public release, establish production keys/HTTPS, change machine assignments or prove installation on a second computer. qanoise01 has no file mapping; no asset was invented for it.

Owner reported download/use working. A targeted installed/repository crypto-import warning fix and a new verified private test-package upload are recorded in QATOOLS_OPENSSL_WARNING_FIX.md. Existing website download mapping still points to the previous package until the owner runs handoff/qafit01_update_dev_download.sql. Initial setup SQL has been updated for new mappings; the original object is retained, not overwritten/deleted.
