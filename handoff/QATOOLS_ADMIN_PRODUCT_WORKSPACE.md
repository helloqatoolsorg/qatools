# Admin product workspace — 2026-10-05

## Owner-approved changes implemented locally

- Cards use the same 16:10 media frame, cropped images and fixed information area regardless of image resolution or missing artwork. Edit/Publish use dark customer-style hover actions. Published cards show a disabled green Published action rather than a state tag. Category, complexity and product type remain customer tags.
- Card/list toggle shares one catalog, combined search and state/type multi-selection. OR within a filter group; AND between groups; removable chips; outside-click/Escape closes the dropdown. Both views default to updated_at descending, with ID descending for ties. The list has thumbnail, name, EUR price, customer tags, state, last save date and Edit/Publish actions. Narrow screens scroll the list horizontally.
- Included tools are larger and visually grouped above price.
- Main/gallery images and HDA selection are available before the first save. Gallery supports multiple selection; failed uploads retain the remaining selected files. Upload selected media and the HDA upload action first save an unpublished metadata draft if necessary. A valid title is required to attach files. Publishing remains a separate server-verified action. Canonical JSON/runtime packaging and private storage are unchanged.
- Text recovery is synchronous browser storage, scoped to the authenticated admin. Pending image/HDA blobs are retained in IndexedDB; metadata edits do not rewrite blobs. Continue editing displays the unfinished title and thumbnail and restores the saved timestamp, request UUID, metadata, price text and selected files. Recovery is local to the same browser/domain; Save writes metadata to Supabase and Upload writes files to storage. Clearing browser storage removes local recovery.
- If no browser recovery exists, Continue editing opens the most recently saved unpublished product. Unsaved, untitled work reserves no database name. Opening another product or starting a new one warns before replacing the single local recovery slot. Completed saves clear only their own recovery; deletion clears recovery. Account changes reset editor state and isolate recovery by user ID. Deleted/published products cannot be resumed as drafts.
- Browser storage failures show a visible warning; file writes in progress or storage warnings trigger a before-unload warning. Lost creation responses retain the request UUID; creation retries apply the latest metadata to the returned draft with timestamp checking. No live content or records were modified by the agent.

## Checks

Nine targeted workspace checks cover account-separated recovery, files and text, queued changes/deletion, quota failures, malformed records, filtering/sorting, actual view controls/columns, HDA upload before initial save, lost creation response retry, and failed gallery upload retention. Existing draft/publication and private HDA packaging regression checks run alongside them. Changed-source ESLint, TypeScript and production build are required before owner deployment.

Isolated browser preview used three sample cards: no image, wide image, tall image plus long subtitle. Measured all cards at identical 436.66px height at the desktop viewport; list columns/actions visually inspected. This is sample-data visual verification, not authenticated hosted end-to-end testing. Owner review remains required after deployment for real artwork, draft navigation/resume and uploads.

## Owner deployment

No migration or remote settings change is needed. Commit only these files:

src/components/AdminProducts.tsx
src/components/AdminProducts.css
src/components/AdminProductCatalog.tsx
src/components/AdminToolPackage.tsx
src/lib/adminDraftRecovery.ts
src/lib/adminProductCatalog.ts
tests/admin-product-workspace.test.cjs
handoff/QATOOLS_ADMIN_PRODUCT_WORKSPACE.md

After Ready: compare card/list views; test filters; start a disposable product with title/image/gallery/HDA selections, navigate to Products before saving, then Continue editing. Upload it, confirm it remains unpublished, then test a failed upload/retry. Owner performs actual artwork/HDA uploads and publication.
