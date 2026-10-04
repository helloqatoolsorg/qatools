# qatools sandbox payment review — 2026-10-04

## Local implementation; deployment pending

The next milestone adds a read-only Payment review section below admin orders. Each request independently verifies the bearer account and admin_users membership before server-only database access. All responses are no-store. Existing service SELECT grants from the applied sandbox migrations suffice; no migration or permission expansion is needed.

Two views use separate bounded pages of 50 rows plus a sentinel:

- Payment events with outcome `review`, newest received first with event-ID tie-breaker. Shows event type, transaction reference, event/received dates and event ID. Body hashes, full provider payloads and credentials are excluded.
- Checkout attempts with status `creating` or `unknown`, unchanged for at least five minutes, newest update first with ID tie-breaker. Shows checkout/customer/item IDs, provider transaction when present and dates. Age is a review heuristic, not proof that payment failed. Normal ready attempts are not labeled failures, and completed/canceled attempts are excluded.

The operator compares the transaction reference with Paddle sandbox and saved order history. This milestone does not resolve ledger entries, retry transactions, cancel reservations, refund payments or alter entitlements. Review outcomes remain historical records rather than a resolved/unresolved queue. Refund/chargeback and safe reconciliation actions still require a separate implementation and approved commercial policy before public paid launch.

The source schema extension is in `src/lib/paymentReviewDatabase.ts`, consistent with the other Paddle integrations. An attempted shared database.types.ts edit was denied despite the project write grant; it was left unchanged.

The owner confirmed the existing sandbox purchase, installed download/activation and matching Paddle/admin order details. The owner also confirmed the order-number migration and hosted displays work. These observations do not establish production payment readiness.

## Rollout

Verification: all 18 targeted payment-review/order tests passed with PostgreSQL fixtures enabled and none skipped. Production build, TypeScript compilation, scoped ESLint and `git diff --check` passed. Hosted verification remains pending deployment.

Commit/push the new route, component, schema extension, tests, admin-page integration and these handoff notes together with the five-digit order display change. Wait for Vercel Ready. In `/admin`, check both payment-review views. Empty views are valid for this account/project state; no new payment or refund is needed to test the empty state. Do not duplicate the owner's completed package upload or purchase.
