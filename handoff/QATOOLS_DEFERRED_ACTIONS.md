# qatools deferred actions

Updated: 2026-10-04

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
| PAY-04 | Define handling of partial monetary refunds, disputes/chargebacks and reversals, repurchases after refund/revocation, and ambiguous checkouts | These cases currently require manual review; restoration/repurchase exceptions are not approved. Decide policy before automation. | Before live launch; automation can be a later milestone |
| PAY-05 | Review reconciliation, failed webhook visibility and operator recovery procedures | Replay and durable event history exist; a complete operational recovery workflow has not been verified. | Before live launch |

## Licensing and tool delivery

| ID | Action | Status and reason | When to revisit |
| --- | --- | --- | --- |
| LIC-01 | Restart/use the second computer offline with its signed license | Explicitly deferred because the owner is remotely connected. Connected machine denial, release, invalidation and reassignment passed. Do not ask the owner to disconnect during the remote session. | Before public distribution, when locally accessible |
| LIC-02 | Verify several owned tools share one machine assignment and one activation action | Account-wide design implemented; real-client coverage with multiple tools remains pending. | Before public distribution |
| LIC-03 | Introduce production signing keys with deliberate client verification continuity | Development signer/client public key currently used. Preserve existing credentials and plan signed-proof/key migration rather than casually replacing keys. | Before public distribution |
| LIC-04 | Add distributed request limiting to licensing endpoints | Pending implementation. | Before public launch |
| LIC-05 | Confirm supported Houdini/Python/OS versions and behavior in long sessions/renders | Current development package targets Houdini 22 / Python 3.13. Broader compatibility and extended-offline/clock/session behavior need explicit support decisions and tests. | Before promising supported platforms or offline behavior |
| TOOL-01 | Upload the latest test tool's actual package and verify a real download/install | Ownership and payment passed; no file is uploaded for this tool. Owner performs routine admin uploads. Do not substitute a different tool's package. | When that tool's package is ready, before publishing it for sale |

## Website, policy and operations

| ID | Action | Status and reason | When to revisit |
| --- | --- | --- | --- |
| WEB-01 | Complete installation instructions and remaining product images/text/files | Installation content has placeholders. Owner reserves normal uploads/content operations for themselves; guide rather than repeat completed uploads. | Next suitable non-payment milestone / before launch |
| LEGAL-01 | Prepare customer terms, privacy, license and refund documents; decide publication/version/acceptance process | Internal policy decisions recorded; no published agreement or acceptance is claimed. Confirm business/support details and unresolved policies before drafting final text. | Before public launch |
| OPS-01 | Confirm support/contact address and customer help workflow | Actual support address remains to be confirmed. | Before public launch |
| OPS-02 | Verify backups, restore procedures, secret continuity and production monitoring | Pending operational checks. Keep secret values out of handoffs. | Before public launch |
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
