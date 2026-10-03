# Verified sandbox payment fulfillment — 2026-10-03

Owner reported migration 20261003080000_sandbox_checkout_intents.sql applied and authorized the webhook step. This is local implementation and synthetic verification, not a completed live payment flow.

## Implemented

- POST /api/paddle/webhook requires explicit sandbox configuration and a real notification destination secret. It verifies the exact streamed raw bytes against Paddle-Signature before JSON parsing. Existing one-MiB bounds, five-second timestamp window and timing-safe HMAC comparisons apply. Full configuration is required; absent secret returns 503.
- Normalizer accepts only a fully completed automatically collected sandbox transaction for the server-recorded opaque checkout ID. Single qafit01 item, matching price/product IDs, quantity one, one-time tax-inclusive EUR price, no subscription, discount or credits, zero outstanding balance, matching one line item and EUR 500-cent total/grand total are required. Subtotal plus tax must equal 500 cents. Different currency/localization is reviewed, not fulfilled automatically.
- Service-only process_sandbox_payment_event RPC applies migration 20261003090000_sandbox_payment_fulfillment.sql. Event ID/body hash deduplication and per-transaction locking precede ownership locking and intent locking. Browser users cannot execute the function or access its RLS table; service has SELECT and controlled RPC execution only for the event table.
- A ready, bound, matching intent and available confirmed/non-banned account are required. SQL does not trust an email or user ID from webhook custom_data. It uses the intent's recorded account. Existing active or inactive ownership prevents a new grant and is recorded for review; revoked/refunded ownership is never restored.
- Order (paid, provider=paddle_sandbox), order item, active purchase entitlement, completed intent and processed event record commit in one database transaction. Any failure rolls back all writes. Existing transaction-order uniqueness and ownership uniqueness protect privileged concurrent insertions as well.
- Same event/hash retries acknowledge without changes. Changed content for the same event ID fails/retries. A second completed event for an already completed intent records duplicate without creating another purchase. A completion arriving before provider binding returns retryable 503 and is not prematurely marked processed. Unknown/unbound intents require reconciliation; automatic POST retry remains blocked.
- Adjustments and transaction cancellations record review and prevent later completion for that transaction from granting ownership. After fulfillment, adjustment review preserves current ownership until the commercial policy and admin handling are approved; there is no automatic refund, revocation or restoration. Other signed event types are recorded as ignored.
- The ledger stores event ID/type, transaction ID, raw-body hash, outcome and timestamps. It does not store full provider payloads, customer address/email, keys or secrets. No provider response is logged.

## Checks and limits

28 combined foundation/catalog/checkout/fulfillment checks passed. Actual isolated PGlite migration tests verified service/browser permissions, order/entitlement linkage, exact EUR amounts, event and transaction duplicates, content collision, binding retry, mismatched transaction, banned account, existing revoked ownership, out-of-order adjustment and rollback after a forced entitlement-insert failure. TypeScript passed. Production-build result recorded below when complete.

Checkout UI remains disabled. No real Paddle transaction/payment, live webhook destination or public exposure was created. Remote 090000 migration is pending owner push. Do not enable PADDLE_SANDBOX_CHECKOUT_ENABLED yet.

Next: apply migration, choose hosted HTTPS staging/delivery, create the real sandbox notification destination for the implemented route, enter its secret privately, implement transaction status/total revalidation and payment UI, then test the full sandbox flow. Subscribe to adjustment events/cancellation for review before paid testing. Manual review monitoring and reconciliation UI are not yet implemented. Production launch remains blocked on refund/chargeback rules, reliable review handling, final currency behavior and end-to-end tests.

Source: src/lib/paddleFulfillment.ts; src/lib/paddleWebhookDatabase.ts; src/app/api/paddle/webhook/route.ts; tests/paddle-fulfillment.test.cjs; supabase/migrations/20261003090000_sandbox_payment_fulfillment.sql. Integration RPC types remain alongside their implementation because the shared type file is write-blocked.

Provider documentation checked: https://developer.paddle.com/webhooks/transactions/transaction-completed/ and the previously recorded signature-verification guide. SQL is trusted only through the signed server route; service-role credentials remain security-critical.

Final verification: production build passed, including the new webhook route.
