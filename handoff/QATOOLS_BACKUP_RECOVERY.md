# qatools backup and recovery readiness — 2026-10-07

## Verified now

A source-only backup routine is implemented in scripts/backup-source.ps1. It writes a unique timestamped directory outside the repository with a complete Git bundle, committed-source ZIP and SHA256 manifest. Existing snapshots are never overwritten. Known local private/cache paths found in Git history cause refusal before archives are created. This is a filename safeguard, not a content secret scanner; secrets must never be committed. It excludes all uncommitted/untracked/ignored work, environment files, dependency caches, database rows and hosted objects. Git histories themselves should be stored privately.

Three isolated Windows tests cover exact committed-file recovery from bundle and ZIP, history identity, exclusion of synthetic local secrets and unfinished edits, repeated snapshots, invalid destinations, committed/deleted private-path history, default path resolution and detached HEAD. All pass. Process-only ExecutionPolicy Bypass allows running this reviewed local script without changing the machine's policy permanently. The routine does not require Docker, Supabase credentials or a network connection.

Actual project snapshot verified and cloned into a separate directory:

- Snapshot: C:\Users\quima\Documents\Codex\2026-10-02\i-was-building-step-by-step\source-backups\qatools-source-20261007-140618-0ea907af
- Recovered source: C:\Users\quima\Documents\Codex\2026-10-02\i-was-building-step-by-step\source-restore-check-20261007
- Exact recovered commit: 093dcb9e3f4401b22481c597d92bdbbb04e147f5, installation guide deployment checkpoint.
- Current uncommitted edits, including this routine until committed, are excluded. The snapshot is not a whole working-directory backup.
- Original working tree, hosted database, storage, live configuration and installed tools were not restored or overwritten. No secrets were read into the manifest or printed.

The local snapshot and restore check are not independent/off-device disaster protection. Copy verified backups to owner-controlled separate storage, and make a fresh snapshot after committing this batch. Existing source changes remain outside the current snapshot until committed; original Houdini authoring source files outside Git need their own owner backup.

## Source backup — owner command

After committing a desired checkpoint, choose an existing drive/folder outside D:\qatools\qatools. Example destination only: D:\qatools-backups. Drive access/capacity and the owner's off-device destination are not assumed verified.

```cmd
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\qatools\qatools\scripts\backup-source.ps1" -DestinationRoot "D:\qatools-backups"
```

Successful output identifies the new snapshot. Copy all three files together. A partial directory without verified manifest is not a successful backup; do not discard older snapshots. No retention deletion or automatic schedule is configured.

For a drill, use a new empty directory, never the live checkout: run git bundle verify, clone repository.bundle, and check out the exact manifest commit. Compare recovery identity before reinstalling dependencies. Use separate staging configuration for functional restore tests; do not direct recovered services/webhooks at production or enable purchases casually. The completed drill here verified source recovery only, not a rebuilt restored application with production secrets.

## Whole-system recovery still needs separate evidence

| Layer | What must be preserved | Current evidence |
| --- | --- | --- |
| Code and migrations | Git refs/history, package lock, SQL migrations, public verifier/runtime and tracked HDA assets | Source snapshot + isolated exact-commit restore verified |
| Uncommitted authoring work | Original HDAs, artwork/project sources and unfinished project edits | Owner-managed backups not verified; source routine excludes them |
| Database | Auth users and stable UUIDs, ownership/origins, orders/items/payment events, credentials/machines, catalog/download mappings and migration history | Free plan has no scheduled project backups. Owner exported schema.sql, data.sql and roles.sql on 2026-10-07; files present and Auth/application COPY sections checked. Migration-history export and isolated database restore remain unverified |
| Storage | Private installer objects and product media bytes, matching bucket/path/metadata mappings | Owner downloaded both buckets on 2026-10-07: 15 private installers and 17 media files. Local paths match the database Storage inventory, no empty files, all 15 ZIPs decompressed. Remote byte equality and isolated restore remain unverified |
| Secrets | Exact activation encryption key, signing private key + key ID and verifier continuity, provider/webhook/SMTP credentials, database/service credentials | Protected off-device copies not verified; never place values in Git/docs/chat |
| Provider/project configuration | Supabase Auth redirects/SMTP, Vercel environment/domain settings, Paddle catalog/mapping/notification destination and sandbox/live separation | Earlier owner functional checks exist; complete recovery inventory not verified |
| Operations | Support ownership, restore authorization, webhook retry/reconciliation and monitoring | Still pending before launch |

Supabase database backup/restore does not copy actual Storage object bytes; metadata and files need a coordinated recovery plan. Available recovery methods/settings must be verified in the actual project. See [Supabase backup/restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) and [restore to a new project exclusions](https://supabase.com/docs/guides/platform/clone-project).

Secret continuity matters: preserving encrypted activation-key rows without their original encryption key cannot recover their existing credentials. Changing a signing key requires the deliberately coordinated public-verifier/client transition in LIC-03. A database/project restore may need new project/service credentials; those are different from the unchanged signing/encryption secrets required for continuity. Do not print or regenerate secrets just to fill this checklist.

## Next owner check

Manual database and Storage exports are at D:\qatools-backups\database-20261007. Windows Storage CLI absolute drive-letter destinations were rejected as unsupported operations; downloads succeeded from the storage backup directory using relative destinations and --workdir D:\qatools\qatools. All expected 32 object paths exist. These exports were taken sequentially, not as one atomic whole-system snapshot. Protected independent/off-device copying has not been confirmed. Next: create a fresh committed-source snapshot, preserve original signing/encryption secrets in owner-controlled protected storage, and plan isolated restoration before launch. Never restore over the live project.

## Local security guard

.gitignore now excludes /security/ and /backups/. Confirmed recovery-codes.txt is ignored and not tracked; its contents were not inspected or changed. This prevents ordinary git add from staging those local directories. It cannot protect secrets already committed or force-added. Keep recovery codes in protected owner storage rather than the repository.

## Repository checkpoint

This is local tooling/docs work, with no SQL migration or app behavior changes. It can share the next related Git checkpoint to avoid a separate deployment cycle:

```cmd
git add .gitignore scripts/backup-source.ps1 tests/source-backup.test.cjs handoff/QATOOLS_BACKUP_RECOVERY.md handoff/QATOOLS_DEFERRED_ACTIONS.md
git commit -m "Add verified source backup and recovery checklist"
```

No git commit/push, production restore, credential export or remote mutation was performed by the agent. OPS-02 remains partially complete, not closed by a source backup.
