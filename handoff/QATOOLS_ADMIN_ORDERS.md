# qatools admin orders — 2026-10-03

## Implemented locally

The Orders placeholder now connects to real Supabase order records through `GET /api/admin/orders`. Every request verifies the bearer session and `admin_users` membership using the existing server authorization helper before reading commercial data. Responses, including authorization failures, use `Cache-Control: no-store`.

Admin can filter existing statuses, browse pages of 50 orders, refresh and expand an order for recorded items, quantities, unit prices, subtotal/total, customer name/ID, dates and provider references. Orders sort by descending ID (latest inserted first). An extra sentinel row determines whether another page exists; the UI does not invent total counts. Filtering resets to page 1. Small screens use stacked summaries and scrollable item tables.

Only customer IDs represented on the current page are used for profile-name lookup. Invoice details, account credentials, signing values and Auth user lists are not retrieved. The display uses recorded order currency/amounts, not current catalog prices. Missing names or related products use an account/product-ID fallback; no missing product data is invented.

This step grants no payment/order/ownership writes. It does not create orders, mark them paid, issue refunds or grant/revoke entitlements. Paddle checkout and trusted payment webhooks remain pending. Existing customer access remains governed by its existing own-row RLS policies.

## Database migration required

`supabase/migrations/20261003040000_admin_order_read.sql` grants SELECT on `orders` and `order_items` to the trusted service role. The inspected baseline did not grant those reads. Browser privileges/policies and existing records are unchanged.

The agent has not applied this migration remotely. In the owner's authenticated terminal at `D:\qatools\qatools`, run `supabase db push`. Expected new migration: `20261003040000_admin_order_read.sql`. Then refresh `/admin` and scroll to Orders. A genuine empty state is normal if there are no recorded orders. Until applied, a protected read can return Unable to load orders.

## Verification

- Production Next build and TypeScript compilation passed.
- 10 new route/database tests passed: missing/invalid login, non-admin, membership lookup failure, invalid filters/pages, bounded paging/customer lookup, empty/last-page results, safe errors and actual isolated PostgreSQL permission/RLS verification.
- The migration test executes the SQL against an isolated fixture and confirms service reads, denied service writes and unchanged customer own-row visibility. It never connects to the remote customer database.
- The actual localhost endpoint without login returned 401 with no-store.

Authenticated remote order retrieval and browser checks of real order details remain pending after the owner applies the migration. The isolated tests do not claim a live Paddle purchase or payment reconciliation.

## Files

- `src/app/api/admin/orders/route.ts`
- `src/components/AdminOrders.tsx` and `AdminOrders.css`
- `src/app/admin/page.tsx`
- `supabase/migrations/20261003040000_admin_order_read.sql`
- `tests/orders.test.cjs`

## Staging decision

The owner accepted postponing the real two-computer activation/renewal/transfer test until a hosted HTTPS staging website is available. It remains required before launch. There is no need now to duplicate the website or its private server configuration onto the second computer. The previously prepared development package/checklist remains a reference, not the current recommended next action.
