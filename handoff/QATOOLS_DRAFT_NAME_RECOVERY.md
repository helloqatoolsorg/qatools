# Draft names and unused draft removal — 2026-10-05

Read-only remote check: no product exists with name or slug qatesta01. The catalog contains five products, including unpublished qatestb01. No remote records were changed or deleted.

The old API interpreted every PostgreSQL unique violation as a duplicate product name. A products primary-key collision (possible after manually inserting explicit IDs) was therefore mislabeled. The exact remote sequence value was not accessible through the catalog API; a stale counter is a likely cause, not a confirmed observation. The migration safely synchronizes the identity sequence under a table lock without lowering its existing value. Failed saves are transactional and do not reserve titles.

A genuine slug conflict now returns the existing product ID and an Open existing product link. Admin search includes the slug as well as name and subtitle. Other uniqueness errors no longer claim a name is occupied.

The editor offers Delete unused draft with confirmation. The server independently checks the admin identity and expected update timestamp. SQL requires a confirmed, unbanned admin; protects published and previously released products; rejects incoming commercial, checkout, catalog setup, download-count and bundle references. Only the draft's own media rows, private download mapping and included-tool list are removed with the draft. Private storage objects are retained, avoiding accidental deletion of shared files. Physical orphan cleanup is deferred. No existing product is automatically deleted or reclassified.

Validation: 17 targeted tests, actual PostgreSQL sequence repair and deletion/name reuse, commercial and bundle reference protection, stale edits, role permissions, route authorization and safe error responses. Production build and changed-source lint checked separately.

## Deployment

Owner runs supabase db push, then commits and pushes only these files:

src/app/api/admin/products/route.ts
src/components/AdminProducts.tsx
src/lib/database.types.ts
tests/product-drafts.test.cjs
tests/product-publication.test.cjs
supabase/migrations/20261005130000_product_draft_identity.sql
supabase/inspection/product_identity.sql
handoff/QATOOLS_DRAFT_NAME_RECOVERY.md

After deployment, retry saving qatesta01. It should save as an unpublished draft and appear under Products / Continue editing. For a genuine duplicate name, Open existing product should open that record. Delete a disposable, unused draft and verify the title can be reused. Products with linked records are deliberately protected.
