# Admin Paddle catalog setup — 2026-10-04

Owner requested automatic creation of Paddle products/prices from admin to avoid repeated dashboard entry for each new tool. This batch is sandbox-only; live payment setup remains a separate milestone. It does not upload tool content or packages on the owner's behalf.

## Workflow

In /admin → Tool prices, select an item and Load price. The panel displays its current website slug and EUR price including tax. Set up Paddle price creates/reuses a standard Paddle product named with the exact tool slug and a one-time EUR price, including tax, quantity one, without trials/overrides. The server revalidates the stored Paddle price and automatically enables the mapping only if the website snapshot is unchanged. Free or unpublished tools cannot use creation.

Existing manual products/prices are scanned first (including archived products, bounded pagination). A matching active standard product and exact valid price are reused without provider writes. Multiple products/prices with the same matching identity require manual choice. Provider/permission failures are not interpreted as missing prices. The manual Connect existing IDs or manage price section remains available for existing entries, disable/re-enable, price updates and recovery. Existing prices are never overwritten by the creation action.

The Paddle sandbox API key requires Products Read/Write and Prices Read/Write. Existing transaction and adjustment permissions must be retained. Do not put API keys in browser inputs, handoff files or chat. Provider operations use the fixed sandbox origin, server-only credentials and no automatic POST retries.

## Durability and access

Migration 20261004190000_admin_paddle_catalog_setup.sql adds a service-only setup ledger and three service-only RPCs. Each RPC verifies a confirmed, nonbanned admin again. A shared per-tool price lock reserves a single immutable slug/amount snapshot; compare-and-swap progress is persisted before product or price POSTs. Double-clicks/concurrent attempts cannot issue duplicate POSTs. Completion verifies the unchanged tool snapshot and inserts the mapping atomically with the existing mapping RPC.

An interrupted or ambiguous attempt is retained, never cleared by age or automatically retried. The UI reloads recorded provider IDs. If creation succeeded but recording failed, the owner checks Paddle using the tool name and the custom qatools_setup_id, then links the verified existing IDs manually. This avoids duplicate creations at the cost of manual recovery for unusual failures. No automatic provider deletion/archival is performed. No order, invoice, entitlement or licensing policy changes.

## Rollout and verification

Implementation added to the repository. Automated route/helper and real isolated PostgreSQL tests cover trusted inputs, admin-only access, reuse, permissions, incomplete scans, ambiguous POSTs, repeated reservations, stage transitions, banned/unconfirmed accounts, changed website prices and server-only privileges. Combined catalog/cart/browser/checkout/fulfillment/review/invoice suite: 87 passed, zero failed/skipped. After a TypeScript narrowing correction, all 12 catalog tests passed again, scoped source lint passed and the production build completed successfully. The full cart migration chain includes the new catalog migration and passes its existing payment/refund/rollback tests. Hosted UI/provider creation remains untested until deployment and the owner configures key permissions. No remote migration, provider write, commit, push or deployment performed by the agent.

Apply the migration before deploying code. The owner already created a second tool's product/price manually; its actual slug and price are still unknown in this chat, so do not invent qarand01 data. Existing manual entries can be connected using the current manual panel or reused by the new setup action. The multi-item hosted purchase/refund test remains pending.

References: [Paddle product creation](https://developer.paddle.com/api-reference/products/create-product/), [Paddle price creation](https://developer.paddle.com/api-reference/prices/create-price/), [Paddle catalog listing](https://developer.paddle.com/api-reference/products/list-products/).
