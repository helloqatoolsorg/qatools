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

## Transaction revalidation — 2026-10-04

New and reused ready checkout transactions are fetched from the fixed sandbox API with no-store, redirect rejection and a ten-second timeout before exposing their ID. Response must match the recorded transaction and opaque intent, sandbox marker, quantity-one qafit01 price/product, EUR, one-time internal-tax 500-cent price, and matching line and transaction totals. Subtotal plus tax, total, grand total and unpaid balance must equal 500 cents; discounts and credits are refused. Paid/completed/canceled/past_due transactions and unexpected attribution or amounts fail closed. No retry creates another transaction. A freshly bound transaction remains bound if subsequent validation fails; the existing SQL CAS prevents the fallback unknown update from erasing a ready binding. No orders or ownership are granted by this validation.

22 checkout/fulfillment tests passed, including actual isolated SQL migrations and rejection of changed status, currency, totals, credits, attribution and failed provider reads. Hosted simulation is independently verified ignored. Checkout UI and PADDLE_SANDBOX_CHECKOUT_ENABLED remain disabled. No real provider transaction was created for these checks. Next: sandbox payment UI with completion/ownership refresh and checkout total monitoring, then a separate test account without existing qafit01 ownership for the full sandbox purchase. Provider GET reference: https://developer.paddle.com/api-reference/transactions/get-transaction/.
Production build and TypeScript passed. Changes are local and are not yet deployed.

## Sandbox checkout window — 2026-10-04

Implemented local cart payment UI using the server-prepared transaction ID, with authenticated GET /api/account/checkout exposing only the sandbox client token when the existing server flag and complete sandbox configuration are valid. SDK loads from the official Paddle CDN only after the user clicks checkout, selects sandbox explicitly, and initializes once per page. Free acquisition remains separate and unchanged. Paid UI currently supports exactly one qafit01 paid item at EUR5; unsupported/multiple paid items are refused without silently omitting them from payment. Cart tax label now states included.

Overlay uses dark theme, disables adding discounts/tax IDs, and checks loaded/updated checkout events for matching transaction, approved quantity-one price, EUR5 total, zero discount/credit. Unexpected totals close the window. This browser guard improves display consistency but is not an authorization boundary; server webhook validation remains authoritative. Browser completion only triggers read-only entitlement refresh every two seconds for up to a minute. Shared state removes the cart item only after active ownership is read from Supabase. Delayed confirmation advises checking Your items later and not paying again. Closing retains the durable reservation so a later attempt revalidates/reuses it; no cancellation/reconciliation behavior is invented. Account changes/unmount clean up listeners and prevent late requests from opening checkout for the prior user.

27 checkout, browser and fulfillment checks passed, including actual SQL migrations, SDK sandbox/single initialization, mismatched totals, other transaction/account events, authenticated flag/config response and browser completion not changing ownership. Production build/TypeScript passed before the final async unmount guard; final checks recorded below. No real sandbox payment or hosted browser overlay test has been completed. No new SQL migration. Local flag remains disabled.

Next operational step: commit/push these local source/test/handoff changes, confirm the new Vercel deployment is Ready, set PADDLE_SANDBOX_CHECKOUT_ENABLED=true in Vercel Production (sandbox configuration only), redeploy, then test with a confirmed account that has never owned qafit01. Verify EUR5 including tax in the actual overlay before submitting a Paddle sandbox test card. Do not use a real card or remove current admin ownership merely to test. Paid end-to-end fulfillment, download and renewal remain pending. Refund/manual-review/reconciliation handling still blocks a public paid launch.

Primary references: https://developer.paddle.com/paddle-js/methods/paddle-checkout-open/ ; https://developer.paddle.com/paddle-js/events/checkout-loaded/ ; https://developer.paddle.com/paddle-js/events/checkout-updated/ ; https://developer.paddle.com/paddle-js/events/checkout-completed/ . Git staging was denied at .git/index.lock despite the project-directory permission grant; owner must stage the nine explicit changed files, excluding unrelated security/.
Final verification: scoped ESLint passed without errors or warnings after separating checkout state by account and deriving confirmation from entitlement state. Four browser/component safety tests passed again after the final lifecycle changes. Final production build and TypeScript passed.
