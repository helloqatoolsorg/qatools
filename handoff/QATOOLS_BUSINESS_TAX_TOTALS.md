# VAT-adjusted sandbox checkout totals — 2026-10-04

Owner enabled optional business details and then observed the actual Paddle total decrease when an accepted VAT number made VAT zero. Earlier zero-tax tests retained the catalog total and did not cover this case. Owner was instructed to pause before paying; no business payment or invoice was claimed verified.

## Implementation

- Catalog prices remain EUR tax-inclusive, one-time, quantity one, no discounts or credit. Immutable reservation snapshots retain these catalog amounts and exact provider product/price IDs.
- Provider transaction validation now separately records each calculated charged amount. Reductions are accepted only with a business ID, zero aggregate VAT, matching zero-tax line/unit totals, no discounts/credits, positive charges no higher than catalog amounts and unchanged price identities/unit prices. The provider's signed completed event remains the financial source of truth; customer VAT details and business IDs are not persisted in qatools events.
- Browser guard permits a lower displayed total only for the same transaction/items, a business tax identifier and coherent zero-tax totals. This does not authorize purchases. Missing/inconsistent totals, increased prices, changed quantities/prices and discounts still close the checkout. Customer/item update events are checked too.
- A ready VAT-adjusted transaction can be revalidated and reopened without creating or binding another transaction.
- Migration 20261004200000_sandbox_business_tax_totals adds charged_amount_cents alongside the unchanged catalog reservation. Existing completed cart intents are backfilled from their saved order totals. Signed fulfillment verifies both catalog snapshots and summed actual charges, atomically records the actual order and item amounts, and persists the final paid total.
- Approved tool refunds match actual paid item amounts; whole-order refunds match the actual order total. Refunds cannot use the higher catalog amount. Original invoices, order numbers, ownership history and legacy payment behavior are retained.
- Admin Check Paddle compares completed checkout payments with charged_amount_cents; pending records continue to show the catalog reservation. No VAT registration data is copied into qatools profiles. Existing invoice download authorization remains unchanged.

## Verification and rollout

Automated tests cover lowered VAT-exempt totals, price/quantity/discount/tax tampering, provider metadata privacy, ready-transaction reuse, migration backfill, actual paid order/item totals, tool and whole-order refunds at those paid amounts, event replay and database permissions. Final combined catalog/cart/browser/checkout/fulfillment/review/comparison/invoice suite: 96 passed, zero failed/skipped. Scoped source lint, production build and diff checks passed. Implementation is local; no remote migration, commit, push or deployment performed by the agent.

Apply the migration before deploying this coordinated source update. Do not pay in the existing browser window until the updated deployment is Ready; reload the website and reopen the same cart/transaction. The account and catalog need not be changed. Hosted reduced-total purchase, grants, admin comparison and invoice company/address/VAT fields remain pending owner checks. If provider data differs from the documented shape, fail closed and inspect the specific mismatch rather than loosening checks.

Earlier checkpoints: qaroad01 at EUR30 was linked by the automatic admin workflow; a fresh buyer completed qafit01 + qaroad01 at EUR35 and reports checkout data on the invoice. Another tool (slug/price still unspecified) was successfully configured through admin for this business test. Optional fields and adjusted colors are owner-reported working. Earlier-account checkout block and multi-item single-tool refund test remain unresolved/pending.

Sources: https://developer.paddle.com/webhooks/transactions/transaction-completed/ ; https://developer.paddle.com/paddle-js/events/checkout-updated/ ; https://www.paddle.com/help/sell/tax/how-paddle-handles-vat-on-your-behalf .
