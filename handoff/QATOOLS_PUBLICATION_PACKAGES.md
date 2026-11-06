# Product downloads and editor — 2026-11-04

Tools and bundles use the existing publication checklist, now requiring an enabled download mapping whose object exists in the private qatools-downloads bucket. A database trigger also enforces this at publication and prevents disabling/deleting the selected mapping of a published product. Valid immutable replacements remain allowed. Uploaded files still must pass the existing ZIP/HDA validation.

Apply migration `20261104110000_publication_package_gate.sql` before deploying the website batch. It also sets the gallery limit to nine images (separate from card/main artwork). No existing products, purchases, files or entitlements are deleted or automatically unpublished.

## Editor

- Gallery: three columns, one Add file tile, maximum nine images, previews, reorder, replace and remove. Changes are staged until Update product. Unpublished draft recovery includes pending gallery files and ordering.
- ZIP: shows selected filename and actual archive contents; replacement requires the exact existing filename, including capitalization. Select a replacement, then Update product. No standalone build/upload action for tools and bundles.
- Update product rebuilds the tool/bundle package with the shared QATools.json and licensing runtime. Tools reuse identical output; replacements use new immutable paths and compare-and-swap. On failure, the previous selected ZIP remains. A missing tool package may remain an incomplete draft, but cannot publish.
- Publish validates the saved download rather than building a second independent artifact. The green Publish button sits below Update product. Project-specific delivery controls are retained.
- Free download is green. After a successful signed link starts downloading, the label becomes Downloaded across the current account's open site session; it remains clickable. This is UI feedback, not ownership or proof of browser transfer completion. Cart hover uses the existing blue In cart palette.

## Existing content

The new gate prevents future publication without a file. Historical published placeholders may already lack one. Run the read-only `supabase/inspection/published_missing_downloads.sql` in the SQL editor to identify these; attach a real package or deliberately unpublish them before selling. Do not manufacture placeholder archives or delete purchase records.

Storage administration can still delete an object independently of the product API. Do not delete selected release objects from the Storage dashboard; replacements retain old objects. Runtime download errors remain a necessary defense against storage outages/deletion, but there is no Coming soon/availability UI.

## Verification

Run `scripts/verify-publication-editor.ps1`, then migrate, commit and deploy. Manually check a staged gallery edit does not apply until Update; wrong ZIP filename is rejected; Update keeps the original filename; a draft without a package cannot publish; and Downloaded permits another download. The isolated PostgreSQL gate/artwork tests were also run with PGlite during implementation.

Pass `-Stage` to stage just this website batch after verification; existing Houdini and unrelated working-tree changes are excluded. The shared state module has pre-existing hooks lint findings outside this change; new editor/API files pass scoped lint. TypeScript passes. Production build must run on the owner's machine because the agent environment cannot canonicalize the D: drive for SWC.
