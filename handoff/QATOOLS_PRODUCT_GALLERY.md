# qatools product gallery — 2026-10-07

Implemented locally; migration/deployment and hosted owner review are pending.

## Editor behavior

- Saved gallery/detail images have clickable replacement inputs, Move earlier/later controls and Remove.
- Gallery order is saved immediately and reflected on the customer tool page after refresh.
- Drafts retain pending multi-file uploads and unfinished-product recovery. Save/upload pending changes before managing existing images.
- Published products allow gallery add, replace, remove and reorder. Product identity, description, composition, price, publication state and main/card image remain protected by the existing editor rules.
- PNG, JPG, WebP and GIF remain supported, at most 4 MiB per image and 20 media rows per product.

No videos, main-image removal, general published metadata editing or bulk upload changes are included. These remain separate backlog items.

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
