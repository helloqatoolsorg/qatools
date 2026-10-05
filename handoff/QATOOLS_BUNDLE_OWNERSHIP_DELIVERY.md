# qatools bundle ownership and delivery

2026-10-05. Implemented locally; remote migration, deployment and hosted owner verification remain pending. Owner handles uploads, publishing and sandbox transactions.

## Behavior

- Bundles are separate paid catalog products. Their fixed price must be positive and below the sum of their selected individual tools. Existing ownership does not reduce the bundle price.
- Buying a bundle grants its product download and missing included tools. Existing independent ownership stays intact. Account-wide activation/refresh includes active included tools through the existing entitlements query; no cryptography or machine-ID changes.
- Each checkout pins selected tool IDs; order items retain that snapshot. The private entitlement_origins ledger records each root grant separately. entitlements remains the active ownership projection, with one account/product row. Refunds and replays update only their originating purchase. Access remains active if another source still supplies it. Explicit revoked tool rows stay blocked.
- Publication checks a validated bundle release matching the selected tools, metadata, main image, price and verified Paddle mapping. Released composition is immutable, including after unpublishing. Package contents may be replaced for the same selected tools.
- Browser roles cannot write the ledger, release attestations, ownership or mappings. Admin routes authenticate independently. Database writers additionally verify confirmed/unbanned admin membership.
- Existing grants are backfilled. Free/admin sources are preserved. Downloads through an inherited bundle grant are counted using its active purchase/admin origin. Counts measure authorized signed-link issuance, not completed file transfers.
- Deleting an unused draft removes its own manifest/mapping/media metadata; commercial/price/history references still block deletion. Storage objects are retained, consistent with existing replacement behavior.

## Automatic bundle installer assembly — current workflow

Supersedes the manual bundle ZIP upload workflow. Select published individual tools with enabled uploaded installers, then click Build bundle installer in the bundle editor. The editor saves the selection first. No bundle upload or new Houdini shelf action is required.

The server fetches each selected tool's private installer, verifies its ZIP/HDA content against its slug and prepared identity when present, and keeps only the HDA. It inserts the current shared qatools.json and licensing/runtime once. The saved archive contains qatools.json at the root, HDAs under qatools/otls/, and shared runtime under qatools/. Individual downloads remain unchanged.

This is a separately saved bundle release. Later changes to an individual installer do not silently change an existing bundle. Click Rebuild bundle installer to explicitly update it. Released included-tool membership remains immutable; rebuilding preserves that composition. Publication and sandbox pricing still use the existing checks.

Missing/disabled/unpublished source tools, invalid ZIPs, identity mismatches, duplicate output filenames, changed sources, stale destination mappings and storage errors leave the current bundle mapping intact. Source paths and the saved selection are rechecked transactionally before selecting the newly uploaded archive. Unselected uploaded objects after a conflict are retained under the existing storage policy. Each source archive is limited to 5 MB and combined source ZIPs/output to 25 MB; source HDA limits remain 4 MB. Larger release handling remains a separate storage milestone. Projects remain unpublished.

The old manual-upload server endpoint remains for compatibility; the editor now exposes only assembly for bundles. Existing bundle archives are preserved until rebuilt.

## Apply locally prepared changes

Run from CMD:

```bat
cd /d D:\qatools\qatools
supabase db push
```

Expected new migration: 20261005140000_bundle_ownership_delivery.sql. After Finished supabase db push, commit only this batch's files:

```bat
git add src/app/api/admin/downloads/route.ts src/app/api/admin/products/package/route.ts src/app/user/page.tsx src/components/AdminProducts.tsx src/components/AdminToolPackage.tsx src/lib/database.types.ts src/lib/houdiniPackage.ts src/lib/bundlePackage.ts supabase/migrations/20261005140000_bundle_ownership_delivery.sql tests/admin-downloads.test.cjs tests/houdini-package.test.cjs tests/bundle-ownership.test.cjs handoff/QATOOLS_POLICY_DECISIONS.md handoff/QATOOLS_FEATURE_BACKLOG.md handoff/QATOOLS_BUNDLE_OWNERSHIP_DELIVERY.md
git commit -m "Add bundle ownership and validated delivery"
git push
```

Wait for the matching Vercel deployment to be Ready. This batch does not change server secrets or require new environment variables. Other pre-existing modified/untracked files are deliberately excluded from these commands.

## Hosted verification

1. Create an unpublished bundle, choose real published tools, upload its matching ZIP, and set a discounted fixed price. Use the existing price panel/publication dialog to create or verify its sandbox Paddle price.
2. Check missing-field and mismatched-ZIP errors, then publish when the readiness checks pass.
3. Use a test account with an independently purchased included tool. Buy the bundle at the full fixed bundle price. Confirm the new tools and bundle appear once, and download/install its prepared ZIP.
4. Refresh the existing account license in Houdini; confirm included tools work with the same account/machine activation.
5. Request and wait for an approved full bundle refund in Paddle. Confirm the bundle and solely inherited tools lose access, while the independent tool remains active. Original invoices remain available under the existing policy.
6. Multiple bundle overlap/replay/rollback cases are covered by isolated PostgreSQL tests; a hosted overlap test can follow when real additional bundles exist.

Existing offline signed proofs can remain valid until their next successful check or expiry. Refund implementation does not change that approved licensing limit. Hosted verification is sandbox verification, not live-payment readiness.

## Local verification

110 targeted tests passed with no failures or skips: bundle ZIP validation and authorized upload, the actual migration chain in isolated PostgreSQL, historical grant backfill, independent/overlapping access, bundle-first mixed carts, refunds/replays, forced rollback, manual grants, download-source counts, unused-draft cleanup, existing cart/payment/VAT behavior, publication, licensing routes and admin recovery. Production build (including TypeScript), changed-source ESLint and diff whitespace checks passed. These tests use synthetic accounts/provider events and do not replace the owner's hosted sandbox and Houdini checks. No remote migration, commit, push, deployment or product upload was performed.


## Automatic assembly rollout — 2026-10-05

Implemented locally, not remotely applied or deployed. Apply migration 20261005170000_automatic_bundle_assembly.sql first. Then stage only this batch:

```powershell
git add next.config.ts src/app/api/admin/products/assemble/route.ts src/components/AdminToolPackage.tsx src/lib/database.types.ts supabase/migrations/20261005170000_automatic_bundle_assembly.sql tests/automatic-bundle-assembly.test.cjs tests/bundle-ownership.test.cjs handoff/QATOOLS_BUNDLE_OWNERSHIP_DELIVERY.md handoff/QATOOLS_FEATURE_BACKLOG.md
git commit -m "Build bundle installers from selected tools"
git push
```

After Ready: open qabundle01, select real published tools with uploaded installers, build, set/verify its discounted Paddle price and publish. Download/install the built archive, verify each included tool uses account activation, then run purchase/refund/repurchase checks. Refund a bundle containing a separately purchased tool and confirm that tool stays active. These owner-hosted tests remain pending.

Local checks: six targeted tests pass (including actual PostgreSQL migration execution), assembly authorization and failure cases, preserved bundle/payment ownership tests. Production build/TypeScript, changed-source lint and diff check passed. No hosted products, source HDAs or installed Houdini licensing caches were changed.
