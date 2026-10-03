# Free-item acquisition — 2026-10-03

Implemented locally as the next standard store step authorized by the owner. Remote migration application and authenticated live testing remain pending.

## Behavior

- Cart GET FREE ITEMS acquires up to 50 free items together for a logged-in, email-confirmed, available account. Paid items stay in the cart; paid checkout remains pending payment-provider integration.
- POST /api/account/acquire-free verifies the session with Supabase getUser. It accepts distinct positive safe integer product IDs and a bounded body, and derives the account ID from verified authentication.
- Service-only acquire_free_items rechecks current published status and zero price in SQL. The selected batch is rejected as a whole if any item is missing, unpublished, paid or has revoked/refunded ownership. Browser roles cannot execute the function; no new browser table-write privileges are granted.
- Active ownership retries are idempotent. Existing ownership source is retained; new rows have source=free and status=active. This step creates entitlements, without orders, payment records or receipts.
- Prices/publication and existing entitlement rows are locked during acquisition. Account acquisitions are serialized with a transaction advisory lock; the existing unique ownership constraint remains the duplicate guard. Parallel production load has not been tested.
- Shared website ownership is reloaded from active entitlements after success. Only server-confirmed acquired slugs are removed from the cart. Houdini includes newly acquired tools on a license refresh; existing machine/credential rules are unchanged.

## Files

- supabase/migrations/20261003050000_free_item_acquisition.sql
- src/app/api/account/acquire-free/route.ts
- src/app/cart/page.tsx
- src/context/QAToolsState.tsx
- src/lib/requireAccount.ts
- src/lib/database.types.ts
- tests/free-acquisition.test.cjs

## Verification and next action

Production build passed. Ten acquisition checks cover actual route authorization/body limits, forged client claims, safe failures, cart success/failure/paid-only behavior and the actual migration in isolated PostgreSQL (PGlite). The existing 32 licensing route/crypto checks also passed after the shared authorization helper changed. Test fixtures contain synthetic accounts/products only; no live product prices or ownership were changed.

Run supabase db push from D:\qatools\qatools and apply 20261003050000_free_item_acquisition.sql. Then test a published zero-price item using a confirmed account: add it to the cart, GET FREE ITEMS, confirm Your items/shared owned state, and refresh the Houdini license. A mixed cart should retain paid items. Do not change a real product price merely to enable this test; use an owner-designated free product when available.

Live account acquisition is not yet verified. This implementation record is not a published user agreement or a new licensing-policy promise. Paid payment/webhook verification and hosted HTTPS machine-transfer testing remain separate pending milestones.

## Owner migration update and live availability

Owner reported supabase db push completed and designated a zero-euro catalog item for testing. Remote migration history was not independently queried. Local main page returned HTTP 200; anonymous POST acquisition returned HTTP 401 with no-store and the expected login message. In-app browser testing could not proceed because the browser tool transport closed while opening the site. Authenticated acquisition, shared ownership after reload and Houdini refresh remain pending owner verification.

## Authenticated live verification — 2026-10-03

After owner login, browser testing acquired published zero-price qanoise01 through GET FREE ITEMS. The server reported success, the item left the cart, and Purchased Products listed qanoise01 and the existing qafit01 as ACTIVE. Both remained ACTIVE after a full page reload. Live website acquisition and persisted ownership are verified. Houdini license refresh for this item and a mixed paid/free cart live check remain untested. Screenshot: Codex workspace work/free/acquisition-live.png. No prices, credentials, machine assignments or paid ownership changed during this test.
