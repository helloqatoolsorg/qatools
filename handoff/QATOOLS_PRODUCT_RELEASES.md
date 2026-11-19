# Product versions and controlled releases — 19 November 2026

Owner-approved behavior

- First release is v1.00. Publish update allocates the next hundredth (v1.01, v1.02, etc.). Existing trusted published mappings are backfilled as one release using their current version where valid; no history is inferred from orphan uploads.
- Update product saves presentation (text, tags, media). It does not rebuild files, advance a version or trigger UPDATED.
- Publish update explicitly commits a validated download, compatibility, release notes, timestamp and UPDATED badge together. Prepared Tool/Shelf Tool identity, product identity and ZIP filename remain unchanged. Bundles rebuild explicitly from the currently published included tools. Projects require the matching source ZIP.
- The product page defaults to the latest release. Selecting another version changes the download, compatibility, release date, notes and Project requirements. Product title, media, price, ownership and trial identity remain shared.
- History is private database data served through safe metadata routes. Older releases can be withdrawn/restored; the current release cannot be withdrawn with that action. Withdrawal is availability control, not deletion or automatic rollback.
- Existing ownership/refund rules and seven-day per-tool trials remain unchanged. Projects still require ownership to download. Selecting versions never restarts a trial or grants ownership.

Older-version delivery

Every original server-built release ZIP remains unchanged in private storage. When a customer downloads a release, the server preserves its exact HDA/Shelf Tool and Project payload bytes and replaces only QATools.json and the shared licensing Python/startup files with the current compatible runtime. This prevents installing an older tool from downgrading the runtime used by other tools. A validated derived ZIP is cached by product, release and runtime-content hash; no original archive is overwritten. The current shared runtime supports Houdini 21 and newer. Unsupported compatibility fails closed rather than silently substituting an incompatible runtime. Any future support-floor change needs an explicit compatible-runtime policy before rollout.

Caches add private storage per downloaded release/runtime combination. Do not delete original release paths or use an orphan-file cleanup that ignores product_releases. Newly uploaded objects from failed/retried publication can be unused; retain them until independently audited. Do not delete an uncertain RPC upload immediately: the transaction may have committed before the response was lost.

Stability and identity

- The database controls version numbers. Published file/compatibility/identity writes through older setters are blocked unless made inside the controlled publication transaction.
- Publication rechecks the current release, included-tool membership and source paths under database locks. Failures roll back the mapping, history and badge together. A repeated request with the same fingerprint returns its prior committed release; changed/stale requests fail.
- Keep source and exported HDA internal names and exported filenames stable for compatible updates. Preserve existing parameters, names and semantics. Changing topology or parameter behavior can still break a saved scene; test a representative older scene in Houdini before publishing. This workflow does not prove behavioral compatibility automatically.
- Initial publication captures its currently validated installer. Drafts can still be prepared normally. Previously released products keep their history if unpublished.
- Project release requirements are snapshotted with its ZIP. Included-tool membership remains the fixed product membership; selected source release paths are pinned per publication.
- Auth utilities and key formats are unchanged. No signing private key or secret is distributed. All admin routes independently authorize and private downloads still require a confirmed account.

Rollout

1. Run the supplied verification script in the owner terminal. It runs the PostgreSQL migration/transaction tests locally in PGlite, relevant route/UI/archive/cart regressions, TypeScript, lint and the production build.
2. Apply 20261119110000_product_release_history.sql using supabase db push, then deploy the scoped website files together. The agent has not applied the migration, uploaded a file, published a product, committed or deployed this batch.
3. Check first publication -> v1.00; a description/media change -> no version/badge change; explicit compatible fix -> v1.01 + UPDATED; select v1.00 -> original tool bytes/requirements with current licensing support. Confirm a scene saved using the prior tool still cooks after installing the update.
4. Check older withdrawal, repeat download, trial/free/purchased access and Project ownership. Keep the older release downloadable unless intentionally withdrawn.

The separate ghost-cart cleanup is included in the scoped deployment list. Deferred Paddle saved-card changes are excluded. Production build must pass in the owner terminal: this agent's filesystem sandbox denied Next.js directory creation during its earlier build attempt; TypeScript and focused tests can run here.
