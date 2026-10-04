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

## Editor and separate-file installer update — 2026-10-05

Owner confirmed the deployed draft form looked right, then requested Admin navigation parity, a tool-page-like editor, filter-style bundle choices/removable tags, publication colors and matching name/icon spacing. Implemented locally: shared AdminHeader/AdminSidebar on dashboard and editor; all section links recognized by admin; artwork left/product fields right with responsive stacking; selected bundle tools removed by clicking anywhere on a tag; published green/unpublished red badges and option styles across products, file/price controls and entitlement item selector. Header name spacing accounts for the icons' 34px hit areas.

Separate HDA/JSON fields now work for saved unpublished individual-tool drafts. The server independently authorizes admin access, bounds multipart inputs to 4 MB total, validates the known Houdini INDX HDA format and standard portable qatools.json, adds only four shared Python files and pythonrc.py from an explicit source allowlist, and prepares a private immutable release ZIP through the existing set_product_download CAS writer. No schema migration is needed. Public standard JSON is available at /qatools.json. HDA filenames must be simple .hda/.hdalc/.hdanc filenames. This targets the current Houdini 22/Python 3.13 development runtime and existing development public verification key; no production-key migration is claimed.

Archive layout: qatools.json at root; HDAs under qatools/otls/; licensing runtime under qatools/python3.13libs/qatools_licensing/; startup under qatools/scripts/. The complete verified ZIP is prepared at upload time and served through the existing owner-authorized download path, instead of rebuilding identical files on every download. Existing ZIP uploads/downloads still work. Uploaded JSON is restricted to the portable standard config, not arbitrary environment changes. Installer uploads do not publish products. Source asset storage is not yet separate from the release ZIP.

The shared builder supports multiple HDAs and rejects case-insensitive duplicate paths, but bundle/project publication, actual constituent ownership/delivery and customer bulk selection are still pending. No bundle checkout is enabled. Owner performs actual content/file uploads. Review editor appearance and a downloaded install before moving to the larger bundle/bulk delivery batch; do not re-upload an existing tool automatically.

Seven packaging/route checks passed, including real HDA preservation, single/multiple tool structure, shared runtime, JSON restrictions, private bucket, admin authorization, stale mapping and failed-save behavior. The generated archive was independently opened and every entry read with .NET ZIP APIs. Build output tracing includes runtime files for Vercel, excludes Python caches; production build/TypeScript and scoped lint results are recorded in the conversation. Live upload/download/Houdini installation is still pending owner verification.

Additional scoped deployment files: next.config.ts; public/qatools.json; src/components/AdminNavigation.tsx; src/components/PublicationState.tsx; src/components/AdminToolPackage.tsx; src/components/AdminDownloads.tsx; src/components/AdminPrices.tsx; src/lib/houdiniPackage.ts; src/app/api/admin/products/package/route.ts; tests/houdini-package.test.cjs. Also include the approved public domain/dialog label updates in houdini/python/qatools_licensing/config.py and houdini_ui.py so server-generated installers use current configuration/text. Leave unrelated HDA binaries, security files, old handoffs and Python tests unstaged.
