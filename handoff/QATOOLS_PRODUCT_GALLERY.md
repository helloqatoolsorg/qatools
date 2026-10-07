# qatools product gallery — 2026-10-07

Implemented locally; migration/deployment and hosted owner review are pending.

## Editor behavior

- Saved gallery/detail images have clickable replacement inputs, Move earlier/later controls and Remove.
- Main/card replacement and gallery add/replace/remove/reorder are local previews until Update product is clicked. Leaving the editor does not apply them. Draft browser recovery can retain unsaved files locally; recovery never publishes them.
- Drafts retain pending multi-file uploads and unfinished-product recovery. All image changes can be staged together. Save/Update product before separately uploading or rebuilding tool installers.
- Published products allow main/card replacement and gallery add, replace, remove and reorder. Product identity, description, composition, price and publication state remain protected. Main/card deletion remains disallowed.
- PNG, JPG, WebP and GIF remain supported, at most 4 MiB per image and 20 media rows per product.

No videos, main-image removal or general published metadata editing are included. These remain separate backlog items.

## Stability and security

`/api/admin/products/gallery` independently authorizes every POST, PATCH and DELETE. It streams bounded uploads and uses the existing image-format validator. Uploads always use new UUID paths; old files are not overwritten.

`manage_product_gallery` is service-only and also confirms admin membership. It locks the parent product and checks the exact expected `updated_at` version. Reorder must contain every current gallery/detail ID exactly once; cross-product, main/card, missing and duplicate IDs fail. Paths must belong to the chosen product and exist in the public media bucket. Results return current media rows and the new version together so the editor stays synchronized.

Gallery removal deletes the database reference, not the Storage object. Replacement retains the previous object. Marketing images were already public; removal does not revoke an old public URL. A database response failure after upload also retains that upload, because its transaction may have committed. Unreferenced Storage cleanup/recovery is deferred; no old media objects were deleted by this batch.

The legacy draft gallery uploader now counts actual media rows rather than the largest sort value, so ordering gaps do not incorrectly consume the 20-image limit. It continues to reject published products and preserves its service-only permission boundary.

## Verification

31 regression tests passed with no failures or skips. The five gallery tests were rerun after adding the legacy draft-upload capacity checks and passed.

Local regression tests cover the gallery API, PostgreSQL mutations, draft creation/publication, bundles and projects. Gallery checks include all method authorization gates, malformed/oversized requests, content validation, private-bucket refusal, stale changes, full-set reorder, protected main image, cross-product refusal, file retention, published commercial metadata preservation, media capacity, old draft-upload ordering gaps and browser-role execution refusal. Component rendering verifies order and accessible replacement/move/remove controls. Production build/TypeScript and modified-module lint passed.

Owner uploads and hosted visual review remain pending. No remote product/media changes, migration, Git push or deployment was performed by the agent.

## Rollout in CMD

First apply the migration from the project folder:

```bat
cd /d D:\qatools\qatools
supabase db push
```

After success, run each command in turn:

```bat
git add src/app/api/admin/products/gallery/route.ts src/components/AdminGallery.tsx src/components/AdminProducts.tsx src/components/AdminProducts.css src/lib/database.types.ts supabase/migrations/20261008090000_product_gallery_management.sql tests/product-gallery.test.cjs handoff/QATOOLS_PRODUCT_GALLERY.md handoff/QATOOLS_FEATURE_BACKLOG.md handoff/QATOOLS_DEFERRED_ACTIONS.md
git commit -m "Add protected product gallery editing"
git push
```

Stop on a failed command. The explicit staging list excludes unrelated older working-tree changes. No new environment variables are required.

Once Vercel is Ready, open Admin → Products → Edit for a draft and a published item. Add/replace a gallery image, reorder two images and remove one; refresh the customer tool page to verify the result. With two editor tabs open, change the gallery in one and confirm a stale edit in the other is rejected with Reload product. Confirm the main artwork, product price and publication state remain unchanged.

## Explicit Update product batch — 2026-10-07

Supersedes immediate gallery saving described in the original batch. Existing gallery migration was owner-applied and its push succeeded. Hosted image edits are not certified by that push alone.

The editor stages image files, replacement previews, removals and order in memory. Update product uploads any changed files into new Storage paths, then applies the complete image set in one `save_product_artwork` transaction. Upload preparation never binds a product image. No network requests occur for gallery selection/removal/reorder alone. A failed upload prevents commit; a stale/invalid commit rolls back the entire image set. Old/unreferenced public Storage objects are retained. Main/card rows cannot be removed or reassigned to another role. New card insertion is permitted only when no main/card exists. The product version, admin membership, path existence, exact row ownership, uniqueness and 20-image limit are checked server-side. Commercial fields and ownership records are untouched.

Draft metadata saves remain their own existing transaction on explicit Save/Update. If metadata succeeds but an image upload fails, metadata can be saved while the previous image set remains intact; pending files remain for retry. Tool import, installer upload/build, Paddle price actions and Publish remain separate explicit actions. Building an installer no longer silently saves pending product fields/images.

Pending image replacements/removals/order are discarded when leaving the editor. The existing Continue editing browser recovery can retain draft metadata/main files/new gallery files locally; those files still require explicit Save/Update to affect the website. Published image changes have no browser recovery.

Rollout (one command at a time, stop on error):

```bat
cd /d D:\qatools\qatools
supabase db push
```

Run `npm run build` in your normal CMD first. The sandbox production build failed before application compilation because SWC could not canonicalize the D: project path (Windows access denied). TypeScript, scoped lint and 35 targeted/regression tests passed with no failures or skips. Apply the migration only after the normal build succeeds. This applies `20261008100000_explicit_product_artwork_update.sql`. After success:

```bat
git add src/app/api/admin/products/artwork/route.ts src/components/AdminGallery.tsx src/components/AdminProducts.tsx src/components/AdminToolPackage.tsx src/lib/database.types.ts supabase/migrations/20261008100000_explicit_product_artwork_update.sql tests/product-artwork.test.cjs tests/product-gallery.test.cjs handoff/QATOOLS_PRODUCT_GALLERY.md handoff/QATOOLS_FEATURE_BACKLOG.md handoff/QATOOLS_DEFERRED_ACTIONS.md
git commit -m "Save product artwork only on explicit update"
git push
```

Owner checks after Vercel Ready: replace published card artwork and change two gallery images/order, verify customer pages stay unchanged before Update, leave/reopen and confirm saved image set is retained. Stage again, click Update product and refresh the customer page. Test a stale second editor tab: its update must fail without replacing the first tab's saved images. Confirm draft Save/Update and installer build instructions work, and price/publication remain unchanged.
