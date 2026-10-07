# qatools deferred actions

Updated: 2026-10-07

Owner's subsequent complete website/admin/download/Houdini feature list is grouped in QATOOLS_FEATURE_BACKLOG.md. Use that document for implementation batches; retain this document for postponed checks, launch dependencies and operational work. No feature in the new list is claimed completed merely because it resembles existing behavior.

This is the central list of work intentionally left for later. Update an existing row when its status changes rather than creating duplicate tasks. Mark completed checks with the date and evidence. Owner-reported hosted checks and automated tests are distinct. Historical handoffs remain historical; this list and the current repository take precedence over older pending checklists.

## Current payment checkpoint

The owner chose to pause payment work and move to another area. Sandbox checks passed for the ordinary qafit01 purchase/download/install/activation, multi-item qafit01 + qaroad01 purchase at EUR35, automatic admin Paddle price setup, optional business billing, original invoice retrieval and approved full refunds. The owner confirmed the Spain business checkout changed EUR10 to EUR8.26, payment and invoice were correct, website/admin amounts matched, ownership appeared, and the approved full refund updated the order, removed tool access and retained invoice access. The latest tool has no uploaded package, so actual file download for that tool is untested. The latest payment suite passed 96 tests with zero failures/skips.

Payment behavior remains sandbox-only. These results permit pausing development; they do not establish live payment readiness or coverage of every refund/dispute case.

## Payment work left for later

| ID | Action | Status and reason | When to revisit |
| --- | --- | --- | --- |
| PAY-01 | Refund one complete tool from a multi-item order and verify the other tool remains owned | Owner explicitly deferred the hosted test. Item-scoped full-refund handling already exists and is covered by automated SQL tests; no additional implementation is requested now. | Before advertising multi-item live checkout as verified |
| PAY-02 | Investigate the earlier test account's blocked checkout despite no visible purchases/orders | Unresolved; a fresh account worked. Inspect saved checkout reservations and entitlement history before identifying the cause. Do not clear history or restore ownership merely to unblock a test. | When resuming payment operations/recovery work |
| PAY-03 | Confirm live Paddle approval, credentials, catalog, domains, notification configuration, receipts, invoices and real end-to-end purchase/refund | Pending separate live implementation/configuration and verification. Sandbox success is not live verification. | Before accepting real payments |
| PAY-04 | Define handling of partial monetary refunds, disputes/chargebacks and reversals, repurchases after revocation, and ambiguous checkouts | These cases currently require manual review; revoked-access restoration exceptions are not approved. Refunded repurchases are deployed and owner-verified, including bundle repurchase and preservation of independently purchased tools. Decide policy before automation. | Before live launch; automation can be a later milestone |
| PAY-05 | Review reconciliation, failed webhook visibility and operator recovery procedures | Replay and durable event history exist; a complete operational recovery workflow has not been verified. | Before live launch |

## Licensing and tool delivery

| ID | Action | Status and reason | When to revisit |
| --- | --- | --- | --- |
| LIC-01 | Restart/use the second computer offline with its signed license | Explicitly deferred because the owner is remotely connected. Connected machine denial, release, invalidation and reassignment passed. Do not ask the owner to disconnect during the remote session. | Before public distribution, when locally accessible |
| LIC-02 | Verify several owned tools share one machine assignment and one activation action | Completed per owner report on 2026-10-07: bundle download/install and one account activation enabled its included tools; purchase, refund and repurchase checks succeeded. Broader version/OS coverage remains LIC-05. | Before public distribution |
| LIC-03 | Introduce production signing keys with deliberate client verification continuity | Development signer/client public key currently used. Preserve existing credentials and plan signed-proof/key migration rather than casually replacing keys. | Before public distribution |
| LIC-04 | Add distributed request limiting to licensing endpoints | Migration applied and website code deployed per owner, 2026-10-07; owner confirmed updated tool/bundle Refresh works. Local throttle tests passed; deliberate hosted throttle verification remains pending. See QATOOLS_LICENSING_LIMITS_7DAY.md. | Roll out before public launch |
| LIC-05 | Confirm supported Houdini/Python/OS versions and behavior in long sessions/renders | Current development package targets Houdini 22 / Python 3.13. Broader compatibility and extended-offline/clock/session behavior need explicit support decisions and tests. | Before promising supported platforms or offline behavior |
| TOOL-01 | Upload the latest test tool's actual package and verify a real download/install | Ownership and payment passed; no file is uploaded for this tool. Owner performs routine admin uploads. Do not substitute a different tool's package. | When that tool's package is ready, before publishing it for sale |

## Website, policy and operations

| ID | Action | Status and reason | When to revisit |
| --- | --- | --- | --- |
| WEB-01 | Complete installation instructions and remaining product images/text/files | Verified Windows/Houdini 22 installation instructions are implemented locally on 2026-10-07, replacing placeholders; website deployment/visual review remains pending. Remaining product images/text/files remain owner content work. | Next suitable non-payment milestone / before launch |
| LEGAL-01 | Prepare customer terms, privacy, license and refund documents; decide publication/version/acceptance process | Internal policy decisions recorded; no published agreement or acceptance is claimed. Confirm business/support details and unresolved policies before drafting final text. | Before public launch |
| OPS-01 | Confirm support/contact address and customer help workflow | Actual support address remains to be confirmed. | Before public launch |
| OPS-02 | Verify backups, restore procedures, secret continuity and production monitoring | Source-only snapshot and isolated exact-commit recovery verified on 2026-10-07. Owner manual database exports and both Storage bucket downloads verified locally (15 ZIPs, 17 media files). Independent copies, migration history, isolated database/Storage restore, secret escrow and monitoring remain pending. See QATOOLS_BACKUP_RECOVERY.md. | Before public launch |
| EMAIL-01 | Check wider email deliverability, quotas and authentication headers/DMARC | Resend domain/SMTP and signup/reset delivery passed owner checks. Wider mailbox coverage and operational limits are unverified; authentication tracking is not configured. | Before public launch |

## Related records

- QATOOLS_LAUNCH_READINESS.md: dated checkpoints and launch scope.
- QATOOLS_PAYMENT_OPERATIONS.md and QATOOLS_BUSINESS_TAX_TOTALS.md: payment/refund implementation and verification.
- QATOOLS_POLICY_DECISIONS.md: approved commercial/licensing policy and unresolved decisions.
- QATOOLS_SECOND_COMPUTER_TEST.md: transfer results and deferred offline check.

Do not repeat completed purchases, uploads or account changes because an older document still lists them as pending. No new remote operation is authorized by this checklist alone.

## Product-management continuation — 2026-10-05

- Complete bundle/project constituent ownership and refund attribution before enabling sales; preserve independent earlier purchases. Composition drafts exist locally and are prevented from publishing.
- Add private project-file delivery, bundle packages and generated bulk-tool installer archives; current draft editor only uploads artwork and reuses existing individual-tool ZIP admin controls.
- Extend editor to published products with appropriate concurrency/payment-price handling; add artwork reordering/replacement/removal, videos and a complete tool-page preview. Current editor updates unpublished drafts only.
- Verify newly deployed product filters, admin catalog/draft creation, artwork and individual-tool publication, plus the card/header refinements on desktop and mobile. No fake product/tool data or remote uploads were made.

Editor continuation update: saved unpublished individual tools now have working separate HDA/portable JSON upload fields and automatic complete private ZIP preparation locally. The shared builder can combine multiple tools, but bundle delivery/ownership, separate source-asset storage and customer bulk download selection remain pending. Review current editor and normal downloaded Houdini installation before that larger batch.

Main-image replacement update — 2026-10-05: inline preview and replacement for unpublished drafts implemented locally with primary-row/timestamp protection. Published editing, removal/reordering/videos remain deferred. Free/paid/admin download-link request counts implemented locally; completed-transfer analytics and historical backfill are not claimed. Apply the two migrations listed in QATOOLS_PRODUCT_DRAFTS.md before deployment, then owner checks upload/replacement and dashboard counts.

Bundle/project refinement — 2026-10-05: approved separate release ZIP uploads rather than dynamically pulling mutable tool files, while retaining backend included-tool links. Implement purchase-source attribution and membership/release snapshots before enabling composed sales. Refund tests must cover direct ownership plus bundle, overlapping bundles, repeated events and partial refunds. Project uploads use ZIP initially; larger uploads need a path that respects hosting request limits. Individual editor/publication fixes are prepared locally in QATOOLS_PRODUCT_PUBLICATION.md.


## Stability checkpoint — 2026-10-07

- DOWNLOAD-01: Owner approved deferring customer Download selection. Keep individual installers and assembled bundle installers as the supported download paths. No selection controls, bulk API or archive merging will be added in this milestone. Revisit only if customer demand justifies the extra operational complexity.
- Owner confirmed bundle and independently purchased tool visibility, bundle refund, repurchase, download and Houdini activation. The grouped account purchases rollout is also owner-confirmed working. Preserve these flows; do not repeat completed uploads or purchases because older dated sections list them as pending.
- Projects, Finance and live payments remain separate unfinished milestones. Sandbox verification does not establish live launch readiness.
- Regression verification and remaining operational readiness are the next stability priority. See QATOOLS_STABILITY_CHECKPOINT.md for current evidence and limits.


## Seven-day licensing rollout — 2026-10-07

Owner approved reducing the offline allowance to seven days. Compatible client/server support and distributed limiting are prepared locally. Update installed/shared runtimes and rebuild hosted tool/bundle installers before treating the new period as rolled out. Existing clients and signed 30-day proofs are preserved during transition. Retire legacy 30-day issuance only after client coverage is verified; universal seven-day enforcement is not yet claimed. See QATOOLS_LICENSING_LIMITS_7DAY.md.


## Backup/readiness checkpoint — 2026-10-07

Source backup script and restore tests implemented; actual committed-source recovery verified in an isolated folder. Local recovery codes protected from ordinary Git staging without reading/changing contents. Whole-system backups are not claimed complete: database availability, Storage object copies, protected signing/encryption secrets and monitoring still need owner evidence. Next owner check is the Supabase Backups page; no production restore or credential export is authorized by this record.


Manual backup update — 2026-10-07: Free plan has no scheduled project backups. schema.sql, data.sql and roles.sql exist outside Git at D:\qatools-backups\database-20261007; Auth/application data sections are present. Both Storage buckets copied with no missing paths versus the exported inventory and no empty files. All 15 tool ZIPs decompressed successfully. This supersedes the earlier pending Backups-page check. Independent copies and full restoration have not been verified.


## Recovery pause and Finance continuation — 2026-10-07

Owner confirmed creation and testing of an encrypted WinRAR archive, restricted Drive upload and downloaded-copy test. Fresh committed-source backup: D:\qatools-backups\qatools-source-20261007-145516-fab82b55. Local configuration copied into encrypted owner backup. The saved encryption key successfully decrypted both database-export credentials and matched stored hashes. Signing-key comparison could not complete in the agent environment because cache access remained denied; owner command result has not been supplied. Exact deployed secret equality, original archive contents/password recoverability by an independent drill, migration-history preservation and whole-system restoration remain unverified. Owner explicitly paused recovery work in favor of the original feature backlog. Do not resume without a relevant request; revisit before public launch.

Finance reporting now implemented locally; see QATOOLS_ADMIN_FINANCE.md. Apply read-only migration, deploy and owner-check existing data; do not repeat purchases or change licenses to verify reports.


Finance checkpoint — 2026-10-07: Owner confirmed the original Finance deployment works. Final authorized refinement: Last 30 days / Last 3 months use daily columns; Last 6 / Last 12 months use weekly columns; 7-day option removed and summary card uses Last 30 days. Rolling UTC intervals include today; final weekly bucket may be partial. Local tests/lint/build passed; new read-only migration/deployment and owner visual check pending. Owner explicitly asked to leave Finance aside after this refinement. Do not extend Finance without a new request.


## Projects batch — 2026-10-07

Owner accepted the compact Finance graph and asked to park Finance; no additional Finance work is included. Projects are now implemented locally using selected published tools plus a separately preserved project ZIP inside one private release. Publication, pinned ownership, independent-tool protection on refunds, repurchase and account grouping reuse the verified bundle model. Upload limits are explicit (project ZIP below 4 MB, expanded project contents at most 20 MiB, complete release payload at most 25 MiB). Migration 20261007230000 precedes deployment; owner real-project purchase/download/install/refund verification remains pending. Larger project uploads and customer Download selection remain deferred. See QATOOLS_PROJECT_DELIVERY.md for implementation, tests and scoped rollout commands. This supersedes older notes that all Projects remain blocked drafts.


## Gallery continuation — 2026-10-07

Owner reported Projects working after the project-delivery migration/deployment and asked to continue. This is a general owner confirmation, not a claim that every specific real-project purchase/refund/relative-resource check has been evidenced. The Projects handoff retains the detailed hosted checklist.

Gallery add/replace/remove/reorder is now implemented locally for saved drafts and published products, with exact-version protection and service-only authorization. Draft pending uploads/recovery remain supported. Main/card artwork and published commercial metadata stay protected. Uploaded old/replaced files are retained; cleanup, videos and broader published metadata editing remain deferred. Apply migration 20261008090000 and deploy using QATOOLS_PRODUCT_GALLERY.md, then owner checks the gallery and stale-tab behavior. No remote media/content changes were performed by the agent. Finance and recovery remain parked.


### Explicit product image update — 2026-10-07

Owner approved published card replacement and explicit Update product. Main/card and gallery edits now stage locally and bind together on Update. Migration/deployment and hosted owner review are pending; see QATOOLS_PRODUCT_GALLERY.md. Finance and recovery remain parked. General published metadata edits and Storage cleanup remain deferred.
