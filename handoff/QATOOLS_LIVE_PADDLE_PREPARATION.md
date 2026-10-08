# Coordinated live Paddle integration — 8 October 2026

## Current status

Implementation complete locally. This supersedes earlier preparation-only checkpoints. The migration can now be applied before deploying this batch, while keeping PADDLE_ENVIRONMENT=sandbox and PADDLE_LIVE_CHECKOUT_ENABLED=false. No remote migration, commit, push, live provider request or deployment was performed by the agent.

Owner reports live API key, live client token and disabled live checkout flag saved in Vercel Production, linked only to qatools. Live website approval remains in review; default payment URL https://www.qatools.org/cart is pending approval. No Paddle AI plugin or account connector was installed.

## Changes

- Server-only environment configuration selects fixed provider API origins and matching credentials. Both browser and server checkouts reject stale environment settings. Live checkout requires its exact true flag and complete configuration.
- Empty live price mappings, catalog jobs, checkout reservations and event ledgers are separate from sandbox. Browser roles cannot access these operations. No test rows are copied into the live ledgers.
- Admin catalog creation, mapping, publication readiness and publish operations use the selected environment. Provider prices are verified before payment and publication; ambiguous writes are not automatically repeated.
- Customer cart transactions and SDK initialization use the matching environment. Only verified server webhooks fulfill orders; browser completion only requests a refresh.
- Live webhook endpoint: https://www.qatools.org/api/paddle/webhook/live. Sandbox endpoint remains https://www.qatools.org/api/paddle/webhook. Each uses its own signature secret independently of selected checkout environment.
- Approved refunds retain source-aware ownership, independent tool purchases and repurchase behavior. Bundle membership is pinned to the original environment's checkout snapshot.
- Stored order provider determines invoice and admin transaction lookup, preserving sandbox history after a live switch. Admin review can select either environment.
- Account ownership remains shared across environments deliberately. Review test accounts and test catalog before public launch; no test entitlements are silently deleted.

## Credentials

Save values privately; never put them in source control or chat.

| Purpose | Sandbox | Live |
| --- | --- | --- |
| API key | PADDLE_SANDBOX_API_KEY | PADDLE_LIVE_API_KEY |
| Client token | PADDLE_SANDBOX_CLIENT_TOKEN | PADDLE_LIVE_CLIENT_TOKEN |
| Webhook secret | PADDLE_SANDBOX_WEBHOOK_SECRET | PADDLE_LIVE_WEBHOOK_SECRET |
| Checkout flag | PADDLE_SANDBOX_CHECKOUT_ENABLED | PADDLE_LIVE_CHECKOUT_ENABLED |

Existing PADDLE_API_KEY, NEXT_PUBLIC_PADDLE_CLIENT_TOKEN and PADDLE_WEBHOOK_SECRET remain sandbox fallbacks only while sandbox is selected. Before switching environments, populate the explicit sandbox names too so historical sandbox invoices and webhook deliveries continue. Do not delete the legacy values prematurely.

Live API permissions: Products Write, Prices Write, Transactions Write, Adjustments Read. Owner selected a 90-day key expiry; replacement is a manual maintenance task, not an installed automation.

## Owner deployment

1. In D:\qatools\qatools, run supabase db push. Expected migration: 20261008130000_live_paddle_flows.sql. If unexpected migrations appear, review them first.
2. Run the workspace helper prepare-live-paddle-deployment.ps1. It checks TypeScript, scoped lint, production build and diff, then stages only this batch's exact files. It refuses unrelated staged files. It does not commit or push.
3. Commit the staged batch with message "Integrate isolated live Paddle payments", then git push. Wait for Vercel Ready and verify its commit matches.
4. Keep sandbox selected and live checkout false. Confirm existing sandbox checkout, invoice and admin review still work.

## Next hosted step after deployment

Create a notification destination in live Paddle for the live endpoint above, subscribing to transaction.completed, adjustment.created and adjustment.updated. Store its secret as PADDLE_LIVE_WEBHOOK_SECRET in Vercel Production and redeploy. Missing destination secret intentionally returns service unavailable until configured. Do not enable live payments as part of webhook setup.

## Later switch and release gates

After approval, operator disclosures and customer policies are finalized, preserve scoped sandbox credentials and switch PADDLE_ENVIRONMENT to live with live checkout still false. Prepare and verify real release product prices in admin; sandbox products/prices do not transfer. Finish payment methods, appearance and payout setup. Review test product visibility and account ownership separately.

Only then explicitly enable controlled live checkout and verify a real purchase, invoice, download, installation/activation and refund before normal sales. Pending postal/business/tax disclosures remain a launch gate. Preserve licensing signing-key continuity.

## Verification

148 targeted Node tests passed with no skips, including actual PostgreSQL via PGlite: catalog reservations, publication, role permissions, cross-provider transaction-ID isolation, webhook signatures/replays/simulations, charge validation, overlapping bundle refunds and repurchases, invoices, browser checks and admin review. TypeScript and scoped lint pass. Account page has seven pre-existing lint errors unchanged by this batch; it is excluded from the helper's scoped lint, not from TypeScript or production build.

The agent production build failed before compilation because Windows SWC could not canonicalize D:\qatools\qatools (access denied). Owner production build is therefore mandatory before staging/push. Provider tests use synthetic credentials and mocked responses; real live delivery and live payments remain untested.

References: [Paddle go-live checklist](https://developer.paddle.com/build/onboarding/go-live-checklist), [Paddle SDK initialization](https://developer.paddle.com/paddle-js/methods/paddle-initialize/). Retain initialization uses an empty pwCustomer for unknown customers; no email is substituted for a Paddle customer ID.
