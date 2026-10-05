# Product editor and publication workflow — 2026-10-05

## Current scope

New product and Continue editing entry boxes; explicit Edit/Publish actions on draft cards; media/GIF management within the editor; included-tool selection above price; editable decimal price (blank remains unknown, not free); automatic shared JSON and runtime for HDA packages; first release date assigned at publication; published HDA replacement uses new immutable storage paths. Metadata of published products remains read-only. Tool-file controls and existing Paddle management are available inside the editor; Tool files and Paddle prices no longer occupy sidebar entries.

Drafts may omit description, subtitle, compatibility, version, price and lookups, while requiring a valid identifying title. Supplied values still undergo validation. Nullable draft metadata is prohibited on published rows; public catalog/cart/detail readers reject rows without prices. Field errors no longer imply that standalone tools require included tools.

## Publication

Both catalog and editor Publish actions open the same dialog. Load/create/connect a matching Paddle sandbox price while the product remains a draft. Free tools skip price setup. Check readiness, then publish. Every route independently verifies the admin. The server rechecks readiness, provider price, current draft timestamp and selected price ID. Database publication locks the product/pricing scope and assigns the first release date in UTC. Existing recorded first release dates are retained; draft date inputs do not determine new publication dates. Price setup is durable and staged; transport ambiguity does not trigger another provider write. Recorded incomplete attempts require checking/reconnecting existing IDs. Setup alone never makes the product public.

Bundles/projects remain blocked by both readiness and the existing database constraint. Their selected tool links can be displayed above customer price after publication is enabled; public membership reads expose only published parents and tools. No bundle ownership or refund behavior is claimed yet.

## Files and limits

Standalone HDA uploads include canonical qatools.json and the current allowlisted runtime automatically. No repeated JSON upload is accepted. Both draft and published standalone HDA releases use the existing private storage/CAS writer, retaining old objects. Current HDA request limit remains 4 MB. Existing advanced ZIP replacement/toggle controls remain available for published products. A future dedicated bundle/project ZIP upload must account for hosting request limits, validate paths/entries, maintain a release manifest and use versioned private storage before composed sales are enabled.

## Owner rollout

Apply 20261005120000_product_publication_workflow.sql before deploying code. Existing published products are not unpublished. This changes draft nullability, supports GIF paths, allows sandbox pricing preparation for saved drafts, adds publication checks, records initial release dates and grants only policy-filtered public membership reads. Source-derived replacements preserve existing authorization and CAS checks. Owner performs actual product content uploads and remote operations.

Review a title-only draft, empty price, image/GIF preview and replacement, HDA upload without JSON, price creation/reconnection while still unpublished, missing-requirement display, and final publish. A paid price mismatch or disabled download must leave the draft unpublished. Check existing published product checkout/downloads and replacement controls too.

## Scoped files

src/components/AdminProducts.tsx
src/components/AdminProducts.css
src/components/AdminToolPackage.tsx
src/components/AdminPrices.tsx
src/components/AdminDownloads.tsx
src/components/AdminNavigation.tsx
src/components/ProductPublication.tsx
src/components/IncludedTools.tsx
src/app/api/admin/products/route.ts
src/app/api/admin/products/readiness/route.ts
src/app/api/admin/products/package/route.ts
src/app/api/admin/products/media/route.ts
src/app/api/admin/prices/route.ts
src/app/api/admin/prices/create/route.ts
src/app/api/account/checkout/route.ts
src/app/page.tsx
src/app/product/page.tsx
src/hooks/useCartProducts.ts
src/hooks/useLikedProducts.ts
src/lib/productDraft.ts
src/lib/productMedia.ts
src/lib/paddleCartCatalog.ts
src/lib/paddleCatalogSetup.ts
src/lib/database.types.ts
supabase/migrations/20261005120000_product_publication_workflow.sql
tests/product-publication.test.cjs
tests/product-drafts.test.cjs
tests/houdini-package.test.cjs
tests/paddle-catalog-setup.test.cjs
tests/free-acquisition.test.cjs
handoff/QATOOLS_PRODUCT_PUBLICATION.md
handoff/QATOOLS_POLICY_DECISIONS.md
handoff/QATOOLS_PRODUCT_DRAFTS.md
handoff/QATOOLS_FEATURE_BACKLOG.md
handoff/QATOOLS_DEFERRED_ACTIONS.md

Leave unrelated security, HDA binaries, older handoffs and Python tests unstaged. No commit/push/deployment was performed by the agent.

## Local verification

75 targeted checks passed across the final corrected runs, with zero skips: draft validation/lifecycle, actual PostgreSQL publication/pricing, auth, stale edits, GIF validation, shared JSON and immutable HDA replacement, existing checkout, free acquisitions and downloads. Readiness and final publication both verify the provider price. Scoped lint, production build/TypeScript and diff whitespace checks passed. Older free-cart tests were updated to mock existing shared navigation/checkout components and reflect the existing absence of a free action in paid-only carts. No customer purchase/refund, hosted upload, remote migration, commit, push or deployment was performed.
