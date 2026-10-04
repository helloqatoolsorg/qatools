# qatools product draft workflow

Local implementation: 2026-10-05. Remote migration and deployment pending owner action.

## Owner workflow

1. Open Admin → Products. Filter published/unpublished, product type or name. New product stays first.
2. Choose New product, then Tool, Bundle or Project. Type is fixed after creation.
3. Fill title (lowercase URL-safe identifier; slug matches), subtitle, description, EUR price, compatibility, version, optional release date, category and complexity. Bundles/projects select published tools, then Add; included tools are separate tags. Fixed discounted price must be below the selected tools' sum; owned tools never reduce it.
4. Accept saves an unpublished draft. Reopen it from Admin Products to edit. A lost response can be retried without creating a duplicate; reload after a stale-edit conflict.
5. Save before Add media. Artwork: PNG/JPG/WebP, 4 MB max, 20 images max. First image becomes card artwork. Existing public product-media storage means draft artwork can be opened by URL. No licenses, private configurations or sensitive files in artwork.
6. Individual tools: upload the actual release ZIP yourself in Tool files. Return to the draft and use Publish tool (separate explicit action). Publication requires card artwork and an enabled download. Paid tools then use the existing Paddle prices controls. Publication alone does not configure payment prices.

## Current limits

Existing products retain their content/publication state and become type tool. Published products are read-only in this first editor. Bundle/project drafts cannot publish or enter checkout until constituent ownership/refunds and delivery are connected. Project-file upload, video/artwork management and fuller product-page preview are not included yet. Existing individual-tool file controls remain separate. Catalog is capped at 500 products and 1,000 composition rows; the route rejects incomplete results instead of hiding rows.

## Deployment

From D:\qatools\qatools apply supabase db push first (20261005100000_product_drafts.sql), then stage only this batch's files, commit and push. Do not deploy the new public selects before the migration. Existing duplicate slugs make the unique index fail; no automatic content rewrites occur. Do not stage unrelated Houdini, security or older handoff changes.

Scoped files:
- src/app/globals.css
- src/app/page.tsx
- src/app/liked/page.tsx
- src/app/admin/page.tsx
- src/app/admin/products/edit/page.tsx
- src/app/api/admin/products/route.ts
- src/app/api/admin/products/media/route.ts
- src/hooks/useLikedProducts.ts
- src/lib/database.types.ts
- src/lib/productDraft.ts
- src/lib/productMedia.ts
- src/components/AdminProducts.tsx
- src/components/AdminProducts.css
- tests/product-drafts.test.cjs
- supabase/migrations/20261005100000_product_drafts.sql
- handoff/QATOOLS_FEATURE_BACKLOG.md
- handoff/QATOOLS_DEFERRED_ACTIONS.md
- handoff/QATOOLS_PRODUCT_DRAFTS.md

## Verification

Tests cover draft validation, unauthorized reads/writes/uploads, service-only SQL privileges, publication readiness, retry without duplicates, stale changes, duplicate slugs, inactive lookups, invalid/nested/self compositions, fixed bundle discount, publication isolation and media validation/failed-attachment cleanup. New source lint and production build/TypeScript pass. Payment/download/order regression results are recorded in the conversation. Hosted visual and authenticated workflow review remains pending owner rollout.

## Remote migration checkpoint — 2026-10-05

Owner reported successful supabase db push applying 20261005100000_product_drafts.sql. Remote schema migration is complete. Code commit/push, Vercel deployment and hosted workflow/visual verification are still pending.
