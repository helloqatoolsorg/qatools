# Server sandbox checkout preparation — 2026-10-03

Owner authorized the next step after verified sandbox catalog mapping. Approved qafit01 price remains EUR 5 including tax, one-time, quantity one.

## Implemented locally

- POST /api/account/checkout independently verifies the Supabase account and confirmed email. Accepts only a productId; client user IDs, totals, quantities and Paddle IDs are rejected. Bounded streamed body and private no-store responses reuse the account-route helpers.
- The route is disabled unless PADDLE_SANDBOX_CHECKOUT_ENABLED is explicitly true; it also requires the full sandbox configuration, including a real webhook secret. Do not enable it yet. There is no paid browser checkout button or webhook fulfillment route.
- Server price verification precedes a service-only reservation RPC. SQL rechecks confirmed/non-banned account, current published qafit01 price, and absence of any active or inactive entitlement. No inactive ownership is restored.
- A durable sandbox intent records account, product, expected price, currency, amount and provider transaction binding. Ownership advisory locking and a unique pending-item index serialize reservations. Duplicate pending requests do not issue another provider POST.
- The Paddle draft/ready transaction request uses automatic collection, EUR and one mapped item at quantity one. Only the opaque intent UUID and sandbox marker are sent as custom_data; account email and Supabase user ID are not sent in this request. Returned attribution/item/currency/status are verified before binding.
- Provider failures, malformed responses, timeouts or binding failures retain creating/unknown records. They are deliberately blocked from automatic retries. A later reconciliation workflow must inspect Paddle by the checkout reference before canceling or retrying. A crash can leave creating indefinitely; no timeout automatically frees the reservation.
- Existing ready reservations reuse their stored transaction ID. Before exposing the payment UI, add provider transaction status/total revalidation and completion/cancellation handling. The initial draft response is not a verified payment or final localized checkout total.
- No order, order item or entitlement is created in this milestone. A later verified webhook must transactionally validate the bound transaction and immutable intent, recheck concurrent ownership, deduplicate events, and fulfill ownership. Refund/chargeback handling remains an explicit future decision.

## Database step

Migration: supabase/migrations/20261003080000_sandbox_checkout_intents.sql.

Creates an RLS-protected sandbox-only table. Browser roles have no table permissions or RPC execution. Service role has table SELECT and only the two controlled reservation/binding RPCs, with no direct writes or table-management grants. UUID and bigint references match existing schema. Local isolated PostgreSQL test passed; remote application is pending the owner's `supabase db push`.

Checkout RPC types live in src/lib/paddleCheckoutDatabase.ts alongside the integration. The shared database.types.ts file was write-blocked by filesystem permissions despite a project-root grant, so no shared schema source was altered.

## Verification

22 foundation/catalog/checkout checks passed, including actual SQL migration in isolated PGlite: account confirmation, browser restrictions, single reservation reuse, cross-account binding denial, ownership/price rejection, attribution validation, unknown-state retention and no automatic provider retry. TypeScript and production build passed. Actual localhost anonymous POST returned 401 and Cache-Control: no-store.

No real Paddle transaction or payment was created. Provider POST is tested with synthetic responses only. Remote schema, authenticated endpoint, hosted webhook delivery and paid end-to-end checkout remain pending. Secrets were not printed or included in source files.

Files: src/app/api/account/checkout/route.ts; src/lib/paddleTransaction.ts; src/lib/paddleCheckoutDatabase.ts; tests/paddle-checkout.test.cjs; the migration above.

Primary API reference: https://developer.paddle.com/api-reference/transactions/create-transaction/.
