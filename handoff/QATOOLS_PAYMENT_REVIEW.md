# qatools sandbox payment review — 2026-10-04

## Local implementation; deployment pending

The owner now authorizes coherent batches of routine related work with one rollout/checklist. The next batch adds comparisons and approved full-refund handling; see `QATOOLS_PAYMENT_OPERATIONS.md`. Its newly approved rule supersedes the earlier statements that all refund handling was undecided. Partial refunds and disputes remain manual review.

Owner confirmed the hosted review section, shorter order displays and original transaction check work (2026-10-04). The adjustment display described below remains local until its next deployment.

The next milestone adds a read-only Payment review section below admin orders. Each request independently verifies the bearer account and admin_users membership before server-only database access. All responses are no-store. Existing service SELECT grants from the applied sandbox migrations suffice; no migration or permission expansion is needed.

Two views use separate bounded pages of 50 rows plus a sentinel:

- Payment events with outcome `review`, newest received first with event-ID tie-breaker. Shows event type, transaction reference, event/received dates and event ID. Body hashes, full provider payloads and credentials are excluded.
- Checkout attempts with status `creating` or `unknown`, unchanged for at least five minutes, newest update first with ID tie-breaker. Shows checkout/customer/item IDs, provider transaction when present and dates. Age is a review heuristic, not proof that payment failed. Normal ready attempts are not labeled failures, and completed/canceled attempts are excluded.

The operator compares the transaction reference with Paddle sandbox and saved order history. This milestone does not resolve ledger entries, retry transactions, cancel reservations, refund payments or alter entitlements. Review outcomes remain historical records rather than a resolved/unresolved queue. Refund/chargeback and safe reconciliation actions still require a separate implementation and approved commercial policy before public paid launch.

The source schema extension is in `src/lib/paymentReviewDatabase.ts`, consistent with the other Paddle integrations. An attempted shared database.types.ts edit was denied despite the project write grant; it was left unchanged.

The owner confirmed the existing sandbox purchase, installed download/activation and matching Paddle/admin order details. The owner also confirmed the order-number migration and hosted displays work. These observations do not establish production payment readiness.

## Rollout

## Sandbox transaction status check — next local milestone

Added CHECK PADDLE STATUS to saved sandbox order details and review entries containing a transaction reference. GET `/api/admin/payment-review/transaction?id=...` independently verifies admin authorization, validates the transaction ID, and requires a matching saved sandbox order, checkout or event before contacting Paddle. Unknown references return 404 without provider access. Database failures and provider/configuration/transport failures return safe errors with no raw diagnostics.

The server uses a single GET to the fixed sandbox API, no-store, rejected redirects and a ten-second timeout. It returns an allowlisted status, currency, total/balance minor units, valid opaque checkout reference and sandbox attribution indicator alongside minimal saved order/checkout data and check time. Missing/malformed or currency-inconsistent totals display Unavailable rather than a fabricated zero. No customer identity/address, payment details, credentials, full custom_data or checkout links are returned. Account changes unmount this component and abort pending display updates.

The comparison is informational. Transaction status is not a refund/dispute determination; adjustments still need review in Paddle. No automatic fulfillment, event resolution, ownership changes or checkout retries occur. Existing paid sandbox orders provide a way to verify the feature without creating another purchase. No SQL migration is needed.

Primary API reference: https://developer.paddle.com/api-reference/transactions/get-transaction/ (GET requires transaction.read, already used by checkout revalidation).

Local verification for the transaction-check milestone: all 17 targeted transaction/review tests passed, including unauthorized/non-admin rejection, reference validation, unknown-reference no-network behavior, allowlisted output, GET-only fixed destination, failure handling and malformed/missing totals. Production build, TypeScript compilation, scoped ESLint and `git diff --check` passed. Tests use synthetic provider responses; the owner should verify the existing completed sandbox order after deployment.

Verification: all 18 targeted payment-review/order tests passed with PostgreSQL fixtures enabled and none skipped. Production build, TypeScript compilation, scoped ESLint and `git diff --check` passed. Hosted verification remains pending deployment.

Commit/push the new route, component, schema extension, tests, admin-page integration and these handoff notes together with the five-digit order display change. Wait for Vercel Ready. In `/admin`, check both payment-review views. Empty views are valid for this account/project state; no new payment or refund is needed to test the empty state. Do not duplicate the owner's completed package upload or purchase.

## Refund and adjustment visibility — local milestone, 2026-10-04

The existing read-only transaction request now uses `?include=adjustments`. The UI displays individual adjustment action, full/partial scope, status, amount, creation date and reference. Pending, approved, rejected and reversed statuses remain separate; refund, credit, chargeback, warning and reversal actions are not summed into a guessed refund or dispute conclusion.

Output is allowlisted: customer references, reasons, items, payout details and raw payloads are excluded. Adjustment IDs must be unique and valid, and transaction references must match the checked transaction. Unsupported/malformed adjustment metadata displays an unavailable notice while preserving the original transaction check. Missing or inconsistent amounts/dates display Unavailable. The documented omitted-adjustments case or an empty array displays “No adjustments returned by Paddle.” A malformed null is unavailable. At most 100 entries are displayed; a longer history gets an explicit incomplete-history notice and directs the operator to Paddle.

This does not issue a refund, change saved order/entitlement status or resolve review entries. Refund and chargeback ownership rules are still undecided and block automatic commercial handling. No SQL migration or new provider endpoint is needed. User should check the existing paid sandbox order after deployment without creating another purchase/refund.

Reference: https://developer.paddle.com/api-reference/transactions/get-transaction/ (`include=adjustments`).

Verification: all 22 targeted transaction/review tests passed with no skips. Coverage includes missing/empty adjustments, full/partial and pending/rejected refunds, chargeback warnings/reversals, malformed/foreign/duplicate entries, unavailable amounts/dates, private-data exclusion and bounded/incomplete histories. Production build, TypeScript, scoped ESLint and `git diff --check` passed. Adjustment cases are synthetic; hosted adjustment retrieval awaits owner deployment/check.
