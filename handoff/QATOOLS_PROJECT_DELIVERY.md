# qatools Projects — 2026-10-07

## Current scope

Projects are a separately priced product containing selected published individual tools and a project-resource ZIP. They reuse bundle purchase-origin ownership, immutable released membership, checkout snapshots, repurchase and refund handling. Refunding a project removes its contribution; independent purchases and other active bundle/project contributions remain effective. In Purchased products, the directly acquired project is one row with its included tools grouped beneath it.

Implemented locally; migration/deployment and owner hosted verification are pending. Finance is accepted and parked. This batch does not activate live payments, customer Download selection, larger uploads or whole-system recovery.

## Owner workflow

1. Admin → Products → New product → Project.
2. Enter title, metadata and fixed price; select existing published tools with enabled installers.
3. Save a Houdini scene and its resources as a normal project ZIP. Include a nonempty `.hip`, `.hiplc` or `.hipnc` scene. Preserve relative resource paths; use Houdini's project-relative paths where appropriate. Do not put HDAs, `qatools.json`, the qatools runtime, license caches or credentials in this ZIP. The selected tool installers supply the HDAs and licensing runtime.
4. Choose Upload project ZIP → Build project download. This saves an unpublished draft first when needed, validates the ZIP and assembles its selected tools from private Storage.
5. Fill remaining metadata/media, then use the existing Publish dialog to create/connect the Paddle sandbox price and check all publication requirements.

The uploaded project ZIP must be smaller than 4 MB (4 MiB minus an 8 KiB multipart allowance), with at most 1,000 entries and 20 MiB expanded contents. The complete release has a 25 MiB payload limit and at most 100 tools. Larger project uploads require a separate direct-upload milestone; these limits are explicit in the editor. Stored and deflated ordinary ZIP archives are supported; encrypted, split, ZIP64, symlink, unsafe-path, conflicting-path, duplicate, corrupt or unsupported archives are refused. Scene presence/ZIP integrity checks do not verify that its artistic content or external references work in Houdini.

## Customer download

```text
qatools.json
qatools/
  otls/                     selected tools
  python3.13libs/            shared licensing runtime
  scripts/pythonrc.py
project/
  <project-slug>.zip         original project archive, unchanged
PROJECT-README.txt
```

Install the shared qatools package using `/install`. Extract the ZIP inside `project/` into a separate working folder and open its scene there. Activate the account once for all owned tools. Keeping the project archive separate avoids merging arbitrary resource paths into the installer and preserves its original folder structure. The release is independently stored; later tool changes do not silently alter it. Re-upload the project ZIP and rebuild explicitly when updating its download.

## Implementation and safeguards

- `src/lib/projectArchive.ts`: bounded ZIP directory, local-header, data-descriptor, decompression and CRC validation; requires a scene and excludes installer/private paths; preserves original bytes inside the release.
- `src/lib/houdiniPackage.ts`: shared entry builder supplies the current central JSON/runtime once, preserving individual and bundle packaging.
- `/api/admin/products/assemble`: independently verifies admin identity, saved project type, current mapping, private bucket, published selected tools and prepared HDA fingerprints. Rechecks selection/source mappings transactionally before binding the new private release. Failed builds never overwrite the current mapping; unsuccessful binding may leave an unreferenced private upload, as in the existing bundle flow.
- Migration `20261007230000_project_delivery.sql`: adds a project-archive SHA256 attestation to the existing private release record, a service-only project writer, project publication checks and checkout member snapshots. Removes the blanket project draft constraint only after these safeguards exist. Reuses effective ownership/refunds without rewriting historical purchases. Existing generic upload/toggle paths cannot attach an unattested project download.
- Draft product type and published composition remain immutable. An edited draft selection requires rebuilding before publication. Missing files, incorrect prices or stale sources fail closed.

## Local verification

Final regression run: 94 tests passed, zero failed or skipped. The extended PostgreSQL suite was also rerun after adding old-bundle-writer compatibility and project-attestation rollback assertions; all four tests passed. Production build/TypeScript, modified admin/server module lint and diff whitespace checks passed.

Node regression tests cover ZIP/assembly, private downloads, draft/publication, payment fulfillment, pinned ownership and refunds. Actual PostgreSQL tests cover project readiness, browser-role isolation, denied generic attachment, invalid source/hash refusal, stale mapping rollback, publication, immutable members, checkout, grouped purchases, download revocation, independent ownership survival, repurchase, old-refund replay and manual grant projection. Production build/TypeScript and modified admin/server module lint pass. `/install` retains its pre-existing anchor/image lint findings; only instruction text was changed there.

## Rollout (CMD)

From `D:\qatools\qatools`, first apply the migration and confirm success:

```bat
supabase db push
```

Then stage only this batch and deploy through the normal Git integration:

```bat
git add src/app/api/admin/products/assemble/route.ts src/app/install/page.tsx src/components/AdminProducts.tsx src/components/AdminToolPackage.tsx src/lib/database.types.ts src/lib/houdiniPackage.ts src/lib/projectArchive.ts supabase/migrations/20261007230000_project_delivery.sql tests/automatic-bundle-assembly.test.cjs tests/bundle-ownership.test.cjs tests/project-archive.test.cjs handoff/QATOOLS_PROJECT_DELIVERY.md handoff/QATOOLS_FEATURE_BACKLOG.md handoff/QATOOLS_DEFERRED_ACTIONS.md
git commit -m "Add protected project downloads and ownership"
git push
```

Stop if a command fails. Existing unrelated working-tree changes are deliberately excluded. No new environment variables, credential changes or Houdini authoring reinstallation are required for this batch.

## Hosted verification still required

Owner uploads a real small project ZIP and publishes a sandbox project using existing licensed tools. Verify purchase/invoice, one grouped Purchased products row, private download, package installation, project extraction and relative resources, and one account activation. Test project refund with an independently purchased included tool: the separate tool remains active, project-only tool access is removed at the existing refresh/expiry boundary, and the project can be bought again. No real purchase, uploaded content or live refund was performed by the agent.
