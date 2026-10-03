# Paddle sandbox foundation — 2026-10-03

Owner confirmed the admin-page duplicate-key correction looks fine and authorized continuing. Owner then reported registering with Paddle. It is not yet known whether this is a sandbox or live account. No Paddle environment/API/client token/webhook-secret settings are currently configured in .env.local; only presence booleans were inspected, never secret values.

## Implemented locally

- Server-only paddleSandbox.ts validates explicit sandbox environment, sandbox API-key prefix, test client token and notification-destination secret. The API host is fixed to https://sandbox-api.paddle.com. Live/mixed/missing credentials fail closed; no secret is logged.
- Server-only paddleWebhook.ts verifies HMAC-SHA256 of timestamp + colon + exact raw request bytes, with timing-safe signature comparisons, multiple h1 signatures for rotation, bounded header parsing and a five-second timestamp window in both directions.
- Streamed webhook-body reader enforces 1 MiB without trusting Content-Length and releases its reader lock. Signature verification does not parse/reformat JSON.
- Seven checks passed: exact Unicode bytes, tampered/changed body, wrong secret, malformed/rotating signatures, expiry/future boundaries, streamed overflow and sandbox/live config separation. Production build passed, including the preceding admin-key fix.

This is tested integration foundation only. There is no webhook route, checkout endpoint, Paddle.js button, receipt processor or order/entitlement writer yet. Helpers are not connected to live payment traffic. No database migration, catalog data, credential configuration, payment, public webhook destination or account was created by the agent. Paid checkout remains disabled. Do not configure a webhook destination to an invented URL; the real route will be introduced with durable processing.

## Account/setup sequence

Paddle sandbox and live accounts, credentials and catalogs are separate. Check https://sandbox-vendors.paddle.com/ . If the recent signup used the regular vendors dashboard, create a separate sandbox account yourself. Sandbox uses test payments and can be used before website approval. Owner enters account details and accepts any terms; agent does not perform those steps.

Next prepare sandbox credentials privately in ignored .env.local when instructed:

PADDLE_ENVIRONMENT=sandbox
PADDLE_API_KEY=<sandbox API key>
PADDLE_WEBHOOK_SECRET=<notification destination secret, once the real route is ready>
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=<sandbox client token beginning test_>

Only the client token is intended for browser use. Keep API key and webhook secret server-only. Do not paste either into chat, put either in a NEXT_PUBLIC_ variable, or replace existing Supabase/licensing environment settings. This step has not yet issued minimal API permission instructions or created a notification destination; those depend on the finished transaction/webhook route.

## Next implementation requirements

1. Map real sandbox one-time Paddle prices to existing qatools products. Do not invent price IDs, tax policy or product details. Confirm that catalog amount/currency agree with chosen pricing behavior.
2. Create checkout transactions on the server for the verified account and non-owned paid products; enforce quantity one and include a server-created checkout identifier for attribution.
3. Add a verified webhook route with event-ID deduplication, durable retries, transactional orders/items/active entitlements, amount/currency/price/cart attribution checks, and out-of-order/duplicate handling. Signature verification alone does not prevent duplicate fulfillment.
4. Never grant ownership from browser checkout success. Review refunds/partial refunds/chargebacks and their entitlement implications separately against approved policy; do not silently adopt commercial rules.
5. Decide hosted HTTPS staging or a deliberate development endpoint for webhook delivery. Paddle cannot deliver to a private localhost address. Production and public exposure remain separate owner-visible setup steps.
6. Test the full sandbox paid path, existing ownership, duplicate events, refunds/denials and receipts before allowing real payments.

## Files

src/lib/paddleSandbox.ts; src/lib/paddleWebhook.ts; tests/paddle-foundation.test.cjs.

Primary docs consulted:
https://developer.paddle.com/sdks/sandbox/
https://developer.paddle.com/webhooks/about/signature-verification/
https://developer.paddle.com/api-reference/about/authentication/

This records implementation status and planned verification. It is not completed checkout or a user agreement.

## Verified sandbox setup and tax-inclusive price — 2026-10-03

- Owner created the separate Paddle sandbox account and credentials. Presence/format checks confirmed PADDLE_ENVIRONMENT=sandbox, a sandbox API key and test client token in ignored .env.local. No API authentication request has yet verified the credentials. Webhook secret/destination remain pending.
- Browser inspection verified active product qafit01: pro_01m41bf7cprd18e5aebzyp1rzw, displayed tax category Standard digital goods.
- Browser inspection of the saved price verified pri_01m41bkp4f0fxgb9cfm37n5p4b: qafit01 one-time EUR, EUR 5.00, One-time, Includes tax, minimum and maximum quantity 1. Owner had already saved these settings; the agent inspected without changing them.
- Owner explicitly approved that the displayed EUR 5 price includes tax so checkout matches the website. This is the current approved pricing direction; it does not decide refunds, localized currency conversion, discounts or future item prices.
- These are sandbox catalog IDs only. No repository product mapping, checkout endpoint or fulfillment route has been implemented. Paid checkout remains disabled. Next connect and validate the real sandbox price against the existing product before transaction/webhook implementation.
## Sandbox catalog mapping verified — 2026-10-03

- Added server-only src/lib/paddleCatalog.ts mapping published product id 1 / qafit01 / price_eur 5 to the verified sandbox product and price above. Other items, free items, unpublished items and changed website prices fail closed.
- Validation requires active standard product and price, matching identities/name, EUR 500 cents, internal (tax-inclusive) tax mode, no billing cycle/trial/local price overrides and quantity exactly one. It does not implement checkout or certify final transaction totals after currency localization; that requires later transaction validation.
- Split paddleSandboxApiConfig from the full configuration so a read-only catalog inspection does not require a nonexistent webhook secret. Full paddleSandboxConfig still requires API key, client token and webhook secret. Fixed sandbox API host, no-store fetch, rejected redirects and ten-second timeout are retained for catalog requests.
- Actual read-only Supabase public catalog lookup verified the published website item. Authenticated Paddle sandbox price GET returned HTTP 200 and passed every catalog check. No payment, transaction, ownership change or database migration was performed.
- Ten foundation/catalog tests, TypeScript check and production build passed. Tests reject price/tax/currency/ID/quantity/recurrence drift and live configuration before fetching. Files: src/lib/paddleCatalog.ts, src/lib/paddleSandbox.ts, tests/paddle-catalog.test.cjs.
- Approved policy: the owner's displayed EUR 5 qafit01 price includes tax. The separate policy file remains write-blocked by filesystem permissions despite directory/root permission grants; this handoff retains the decision.
- Next implement server checkout attribution and durable verified-webhook fulfillment before enabling paid checkout. Refund handling and hosted delivery remain explicit pending steps.
## Server checkout preparation

The next authorized step added a disabled server checkout route, a durable sandbox intent migration and provider transaction validation. No payment or ownership was created. 22 checks, TypeScript and production build passed; actual anonymous endpoint returned 401/no-store. Remote migration 20261003080000_sandbox_checkout_intents.sql awaits owner push. Do not set PADDLE_SANDBOX_CHECKOUT_ENABLED yet. Detailed implementation, ambiguity/reconciliation limits and pending webhook work: QATOOLS_SANDBOX_CHECKOUT.md.
## Verified webhook implementation

Owner reported 080000 checkout-intent migration applied. Locally added the signed sandbox webhook and atomic event/order/item/ownership processing migration 20261003090000_sandbox_payment_fulfillment.sql. 28 checks and TypeScript passed, including actual isolated SQL permission/rollback/replay tests. No real provider delivery or payment was performed; checkout remains disabled. Remote migration and hosted notification destination/signing secret remain pending. Details and required manual-review/refund limitations: QATOOLS_SANDBOX_WEBHOOK.md.