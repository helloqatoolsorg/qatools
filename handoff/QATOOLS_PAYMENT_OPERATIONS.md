# qatools sandbox payment operations batch — 2026-10-04

## Approved owner policy

Owner approved on 2026-10-04: an approved full refund marks the purchased tool's ownership refunded, blocking new download links and future license renewals for that tool. Existing signed offline authorization survives until successful refresh removes that tool or the proof expires. Other owned tools, account activation key and machine assignment are retained. This is an implementation decision record, not a published refund agreement.

Partial refunds, pending/rejected refunds, credits, disputes/chargebacks and their reversals remain manual-review cases. No automatic ownership restoration or repurchase exception was approved. Refunded/revoked ownership continues to block a new acquisition under the existing rule. General customer refund eligibility and legal terms remain open.

## Implemented locally

- Exact server comparisons of saved order/checkout totals, currencies, checkout reference, sandbox attribution and zero balance for paid/completed transactions. Missing values show Unavailable; differing values show a review warning. Comparison is evidence only and does not grant ownership or resolve disputes.
- A separate Processed full refunds admin view filters durable ledger outcome `refunded`, retaining bounded paging and server admin authorization. Review events remain historical entries; a prior pending event can still appear after an approved refund.
- Normalization recognizes approved full EUR refunds in signed `adjustment.created` or `adjustment.updated` events. Requires a valid adjustment and transaction ID, explicit refund/full/approved fields, no subscription and valid positive root totals. Simulation events cannot enter automatic refund handling. Raw reasons/customer details are not stored.
- New migration `20261004130000_sandbox_full_refunds.sql` extends the existing service-only transactional webhook RPC and ledger outcome constraint; applied historical migrations are unchanged. It binds the refund to a saved sandbox order and completed checkout, checks the same owner/product, exact refund/order/checkout amount, single quantity-one order item and purchase entitlement linked to that exact item.
- Only the matched active purchase entitlement becomes refunded. An already revoked entitlement stays revoked. Order status becomes refunded; original order number and full history remain. Other products, credentials and machine records are untouched. The existing renewal queries include only active entitlements and downloads require active ownership.
- Event hash/id deduplication and transaction/ownership locks are retained. Order, ownership and refund ledger updates commit atomically. Duplicate delivery does not restore access. A refund before original fulfillment records review and prevents later automatic ownership grant. Different amount, provider, owner, item, product, source or incomplete attribution remains review-only.
- The migration does not retroactively apply older ledger records. A known past approved refund needs an explicit reconciliation/replay plan before changing existing access.

## One rollout for this batch

Verification: 88 targeted checks passed with no skips across payment fulfillment/refunds, review/comparison, downloads and licensing routes/database fixtures, including genuine server-signature verification by the Houdini Python client. The actual new SQL executes in isolated PostgreSQL and checks rollback after a forced entitlement-update failure, duplicate refunds, unrelated tools, mismatched product/source/item binding, simulations and refund-before-completion ordering. Production build/TypeScript, scoped ESLint and `git diff --check` passed. No hosted refund was performed by these tests.

1. Owner runs `supabase db push` from `D:\qatools\qatools` (expected migration 20261004130000).
2. Owner commits/pushes the exact listed batch files; wait for Vercel Ready.
3. In Paddle sandbox notification destination settings, ensure both `adjustment.created` and `adjustment.updated` are subscribed, alongside `transaction.completed`. No new secret or destination is needed. The owner makes these routine dashboard changes.
4. Check existing sandbox order comparison, then processed-refund empty state. For an actual full-refund test, use the existing disposable sandbox purchase only after acknowledging its tool access will be removed. Initiate the refund in Paddle, let approval/delivery complete, then verify order refunded with same number, purchased access removed, downloads denied and licensing refresh excludes the tool. Pending approval must not remove access. This manual hosted test is not claimed completed locally.

No real refund or remote mutation has been performed by the agent. Automatic commercial handling remains sandbox-only. Public live launch still needs its separate configuration, real signer, customer terms, refund eligibility policy and remaining integration checks.

## Hosted refund correction — 2026-10-04

Owner requested the existing disposable sandbox purchase refund in Paddle. Read-only diagnostics confirmed API transaction.read succeeds but adjustment reads return 403 until Adjustments Read is added to the existing key. Owner added that permission; the approved adjustment then became visible. Add `adjustment.read` to the setup checklist (no adjustment.write is needed for the website's read-only check).

Actual dashboard behavior: the adjustment is labeled `partial`, while its single item is labeled `full` and its EUR total equals the entire original order. The previous normalizer required adjustment-level `full` and left both notifications as review, preserving active access. This exposed a real integration gap not represented in the initial synthetic tests.

The correction accepts an approved item-based refund only when it contains one valid transaction-item reference marked full with a matching item/refund total. The existing SQL must still prove exact coverage of the entire saved single-item order, matching owner, product, currency, amount and purchase entitlement. Refunds of smaller amounts and partially refunded item scopes remain review-only. This implements the original approved fully-refunded-tool policy without broadening it to partial monetary refunds.

New append-only migration `20261004140000_recheck_approved_refund_events.sql` lets a signature-verified replay re-evaluate a previously reviewed approved-refund event only when the original body hash matches. Other outcomes remain idempotent, changed-body retries are denied, simulations stay ignored, and order/access/ledger updates remain atomic. Replay must come through the existing verified Paddle webhook; do not edit remote orders/entitlements manually or request a second refund.

Correction rollout: apply migration, commit/push and wait for Ready, then replay the existing approved `adjustment.updated` notification in Paddle. Confirm the existing order is refunded with the same number, ownership/download/renewal access removed only for that tool, and Processed full refunds contains the event. The agent has not performed this replay or mutated remote records.

Correction verification: all nine targeted fulfillment tests passed with actual PostgreSQL enabled and no skips, including the observed item-based refund shape, changed-hash rejection and reprocessing a previously reviewed same-body event without duplicate writes. Production build/TypeScript, scoped ESLint and `git diff --check` passed. Hosted correction/replay remains pending.

References: https://developer.paddle.com/webhooks/adjustments/adjustment-updated/ and https://developer.paddle.com/webhooks/adjustments/adjustment-created/ . Subscribe to both because approval can exist at creation or arrive in a later update.

## Notification replay identity correction — 2026-10-04

Owner's approved-refund replay returned HTTP 503 with the webhook's processing error. Read-only inspection confirmed the same adjustment.updated event ID, a new notification ID and the prior ledger outcome review; the order still remained paid. Paddle replay creates a new notification entity for the same event. Comparing exact raw-body hashes therefore rejects legitimate replays.

The webhook still verifies the signature over exact raw bytes first. It now additionally hashes canonical event content, excluding only the top-level notification_id; recursively sorted JSON object keys make formatting/key order irrelevant. Event content and array order remain significant. Neither raw customer data nor delivery headers are stored. The original raw digest remains available.

Append-only migration 20261004150000_paddle_replay_event_identity.sql adds a nullable stable event_hash. New records reject any changed canonical event content and also bind event type, transaction and occurrence time. For historical records without this digest, a fresh signature-verified delivery must match the saved event/type/transaction/time. Existing terminal outcomes are returned without mutations; only reviewed approved full-refund candidates may be rebound to the complete order/checkout/entitlement checks and adopt the stable digest atomically. Historical content cannot be reconstructed from the old raw hash, so the migration trusts a newly verified Paddle snapshot for this narrow recovery rather than claiming an unavailable old semantic comparison. Browser RPC permissions and simulation isolation stay unchanged. This supersedes the preceding raw-hash-only replay requirement.

Local verification: all 10 fulfillment checks passed with actual isolated PostgreSQL and no skips, including changed notification IDs for payments/refunds, recovery of a legacy reviewed refund using a new delivery, changed-content rejection, one ledger row, rollback and preserved unrelated ownership. Production build/TypeScript also passed. No remote records were mutated by the agent. Hosted migration/deployment/replay verification remains pending.

Owner rollout: supabase db push; commit/push only this correction's six source/test/migration/document files; wait for Vercel Ready. Replay the ORIGINAL approved adjustment.updated notification (Paddle does not allow replaying a replay), then verify HTTP 200 and the original order/refunded ownership state. Do not request another refund.

Reference: https://developer.paddle.com/api-reference/notifications/replay-notification/ and https://developer.paddle.com/webhooks/about/how-webhooks-work/ .
