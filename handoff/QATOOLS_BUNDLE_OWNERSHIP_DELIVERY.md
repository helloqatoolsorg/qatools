# qatools bundle ownership and delivery

2026-10-05. Implemented locally; remote migration, deployment and hosted owner verification remain pending. Owner handles uploads, publishing and sandbox transactions.

## Behavior

- Bundles are separate paid catalog products. Their fixed price must be positive and is independent of individual tool prices. Existing ownership does not reduce the bundle price.
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

1. Create an unpublished bundle, choose real published tools, upload its matching ZIP, and set its fixed price. Use the existing price panel/publication dialog to create or verify its sandbox Paddle price.
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

After Ready: open qabundle01, select real published tools with uploaded installers, build, set/verify its Paddle price and publish. Download/install the built archive, verify each included tool uses account activation, then run purchase/refund/repurchase checks. Refund a bundle containing a separately purchased tool and confirm that tool stays active. These owner-hosted tests remain pending.

Local checks: six targeted tests pass (including actual PostgreSQL migration execution), assembly authorization and failure cases, preserved bundle/payment ownership tests. Production build/TypeScript, changed-source lint and diff check passed. No hosted products, source HDAs or installed Houdini licensing caches were changed.


## Bundle editor title fix — 2026-10-05

Bundle/project display titles accept capitalization and spaces (QA Test Bundle). The generated identifier is lowercase with underscores (qa_test_bundle). Existing identifiers remain stable through title edits and reloads. Server/database validation agree, while prepared individual-tool identity stays locked. Missing price, media or included tools do not block saving an unpublished draft; publishing still enforces its complete checklist. Included-tool options use customer-filter spacing and brighter selected backgrounds.

Apply 20261005180000_bundle_display_titles.sql, then deploy:

```bat
cd /d D:\qatools\qatools
git add src/components/AdminProducts.tsx src/components/AdminProducts.css src/lib/productDraft.ts src/app/api/admin/products/route.ts supabase/migrations/20261005180000_bundle_display_titles.sql tests/product-drafts.test.cjs tests/bundle-ownership.test.cjs handoff/QATOOLS_BUNDLE_OWNERSHIP_DELIVERY.md
git commit -m "Separate bundle titles from stable slugs"
git push
```

Owner check after Ready: title a bundle QA Test Bundle, confirm the slug qa_test_bundle, save an unfinished draft, reload, complete its included-tool selection and build. Confirm selected options brighten. Rename a saved draft and confirm its slug remains unchanged. Publication checks remain separate.


## Empty POST transport fix — 2026-10-05

The assembly endpoint now accepts empty POST streams as well as null bodies. The previous body-presence check incorrectly rejected an empty request stream as an invalid saved bundle. Any actual payload bytes are still rejected before catalog/storage work; included tools always come from saved database metadata. Regression coverage checks an empty non-null stream and rejects whitespace, JSON and file bytes.

No migration is needed. Deploy only:

```bat
cd /d D:\qatools\qatools
git add src/app/api/admin/products/assemble/route.ts tests/automatic-bundle-assembly.test.cjs handoff/QATOOLS_BUNDLE_OWNERSHIP_DELIVERY.md
git commit -m "Accept empty POST streams for bundle assembly"
git push
```


## Independent bundle pricing rollout — 2026-10-05

The constituent-price-total requirement has been removed. Bundles retain their own positive price; included-tool prices may be free or differ without affecting the bundle. Apply 20261005190000_independent_bundle_pricing.sql before reloading readiness. No frontend change is needed. Tests cover equal/higher pricing, free constituent tools and invalid zero bundle price.

```bat
cd /d D:\qatools\qatools
supabase db push
git add supabase/migrations/20261005190000_independent_bundle_pricing.sql tests/bundle-ownership.test.cjs handoff/QATOOLS_POLICY_DECISIONS.md handoff/QATOOLS_BUNDLE_OWNERSHIP_DELIVERY.md
git commit -m "Keep bundle prices independent from included tools"
git push
```


## Purchased-products relationship fix — 2026-10-05

Confirmed remotely with a read-only zero-row request: the unqualified entitlements/products embed returns PGRST201 because entitlement_origins introduces a second relationship. Purchased products, global owned/cart state and two admin entitlement reads now explicitly use products!entitlements_product_id_fkey. No grants, RLS, ownership, payment records or activation state were changed. Full purchase/product/category and admin purchase/activation joins, plus account-machine fields, resolve with HTTP 200 against the live schema using zero-row requests.

Production build/TypeScript and admin-route lint passed. Existing context lint still reports two pre-existing set-state-in-effect errors and a dependency warning on unchanged lines; no unrelated React refactor was made. Admin, download and licensing security tests passed; the storage SQL test was then rerun with isolated PostgreSQL enabled.

No migration required. Deploy:

```bat
cd /d D:\qatools\qatools
git add src/context/QAToolsState.tsx src/app/user/page.tsx src/app/api/admin/customers/route.ts src/app/api/admin/entitlements/grant/route.ts handoff/QATOOLS_BUNDLE_OWNERSHIP_DELIVERY.md
git commit -m "Disambiguate product ownership queries"
git push
```

After Ready: refresh the customer account, verify the purchased bundle and included tools, download the saved bundle and continue Houdini installation/activation. No repeat payment is required to verify this fix. Hosted user verification remains pending.


## Grouped customer acquisitions — 2026-10-07

Owner approved showing directly acquired products as standalone entries, with bundle-only tools nested under their bundle. A separate tool purchase stays standalone even if also included in a bundle. Current access and direct acquisition are read separately from entitlement_origins, so a refunded direct purchase still supplied by an active bundle is not falsely shown as standalone. Free and admin grants retain their standalone entries when they have their own active origin. Included-tool links use the pinned active bundle contribution; customer downloads still use the saved bundle release.

This cohesive batch includes displayed product counts, an explicit Refresh purchases action and the latest verified purchase date after repurchase. Account-wide licensed tool counts and Houdini access still use all effective entitlements. read_account_purchases is a read-only SECURITY DEFINER function executable only by service_role; the trusted GET route independently authenticates and passes only the verified account ID. No browser ledger grants, signing/cache changes or ownership mutations were introduced.

Actual PostgreSQL tests cover mixed bundle/individual checkout, item-only bundle refund, bundle repurchase, direct-tool refund while bundle access survives, independent admin grants, other-account machine isolation and execute privilege restrictions. Account-route tests cover authenticated attribution, denial before SQL and private/safe responses. The owner's previously confirmed sandbox purchase/download/activation/refund/repurchase cycle remains verified; grouped display requires a hosted check after rollout.

Apply the one migration, then deploy this batch from CMD:

```bat
cd /d D:\qatools\qatools
supabase db push
git add AGENTS.md src/app/user/page.tsx src/app/globals.css src/app/api/account/purchases/route.ts src/lib/accountPurchases.ts src/lib/database.types.ts supabase/migrations/20261007200000_account_purchase_groups.sql tests/account-purchases.test.cjs tests/bundle-ownership.test.cjs handoff/QATOOLS_POLICY_DECISIONS.md handoff/QATOOLS_FEATURE_BACKLOG.md handoff/QATOOLS_BUNDLE_OWNERSHIP_DELIVERY.md
git commit -m "Group included tools under purchased bundles"
git push
```

After Ready: Refresh purchases on the existing customer account. Expect bundle plus separately acquired test B; test C appears within Included tools, with no extra standalone product count. If the separate tool's purchase is refunded while bundle access survives, it becomes bundle-only. Existing downloads and activation continue to work.

Future small related fixes should be proposed and grouped with the next authorized steps into one rollout; this preference is recorded in AGENTS.md. Project delivery, bulk customer downloads and finance remain separate future feature batches.
