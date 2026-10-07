# qatools Admin Finance — 2026-10-07

Owner selected Finance from the feature backlog and paused further recovery testing. This batch adds a read-only report to the existing Admin sidebar and preserves Orders, checkout, refunds, ownership and licensing behavior.

## Metrics and limits

- Defaults to Sandbox with a prominent test-money notice. Live reads only `provider=paddle`; sandbox reads only `paddle_sandbox`. Live reporting does not enable or verify live payments.
- Each currency has its own totals/chart; no exchange rates or combined currency totals.
- Customer payments use stored actual `orders.total`, including tax where charged, for paid/refunded/partially_refunded orders. Pending/cancelled orders and free acquisition providers are excluded.
- Fully refunded orders contribute their original total once, including legacy orders whose item flags predate the current refund flow. Item refunds in partially refunded orders use recorded `unit_price * quantity` for fully refunded items. Bundles count as order lines, not constituent tools. Repurchases are separate orders.
- Remaining payments = customer payments minus recorded refunds. This is not merchant profit, tax-exclusive revenue, a Paddle balance, or payouts. Unsupported partial monetary refunds/disputes are not invented from order statuses and still require Payment review/Paddle reconciliation. Inconsistent stored item flags/amounts produce a visible review warning.
- Date basis: original provider completion date, falling back to local order creation date; UTC. Future-dated records are excluded. Refunds update the original purchase cohort, rather than being plotted on refund dates. No refund-date cash-flow claim is made.
- Last 7 days and current month use daily buckets; 3/6/12 months include the current calendar month and preceding months. Zero buckets are filled. Lifetime and current-month amounts are independent of the selected chart range.
- Responsive CSS bars with accessible exact-amount table, loading/error/empty states, manual refresh and request cancellation. No new chart library.

## Security and implementation

`GET /api/admin/finance` independently calls requireAdmin and validates environment/period. Responses are private/no-store; errors expose no SQL diagnostics. The service-only SECURITY DEFINER function independently checks confirmed, unbanned admin membership, fixes search_path, rejects invalid inputs and returns aggregated figures only. Browser roles have no execute permission. No customer emails, credentials or raw payment records are returned. Aggregation runs across matching orders in PostgreSQL, not a truncated browser/PostgREST page. No commercial writes, new browser table grants, migration replay, or hosted mutation performed by the agent.

Files:
- `supabase/migrations/20261007220000_admin_finance.sql`
- `src/app/api/admin/finance/route.ts`
- `src/components/AdminFinance.tsx` and `AdminFinance.css`
- `src/components/AdminNavigation.tsx` and `src/app/admin/page.tsx`
- `tests/finance.test.cjs`
- `src/lib/adminFinance.ts` and `src/lib/database.types.ts` (shared report/RPC types)
- this handoff and the feature/deferred records

## Owner rollout

## Verification

19 Finance + Orders tests passed with zero failures/skips. Actual PostgreSQL/PGlite checks covered aggregate sums, business-tax-adjusted charges, legacy whole-order refunds, partial-order fully refunded items with quantity, independent repurchase orders, historical purchase dates, currencies, sandbox/live separation, zero buckets, inconsistent-record warnings, function permissions and confirmed/unbanned admin checks. Route tests covered authentication, filter validation and private failure responses; rendered component tests covered loading/error/empty state, exact amounts and sandbox warnings. Scoped lint for new TypeScript files, production build/TypeScript and tracked diff whitespace checks passed. Hosted browser visual review is still an owner rollout check.

## Deployment commands

Apply the read-only report migration before deploying code:

```cmd
cd /d D:\qatools\qatools
supabase db push
```

Then stage only this batch (existing backup work and unrelated files remain separate):

```cmd
git add src/app/api/admin/finance/route.ts src/components/AdminFinance.tsx src/components/AdminFinance.css src/components/AdminNavigation.tsx src/app/admin/page.tsx src/lib/adminFinance.ts src/lib/database.types.ts supabase/migrations/20261007220000_admin_finance.sql tests/finance.test.cjs handoff/QATOOLS_ADMIN_FINANCE.md handoff/QATOOLS_FEATURE_BACKLOG.md handoff/QATOOLS_DEFERRED_ACTIONS.md handoff/QATOOLS_BACKUP_RECOVERY.md
git commit -m "Add read-only admin finance reports"
git push
```

After Vercel Ready: open `/admin?section=finance`; check Sandbox totals against existing Orders, refunded/rebought order totals, all five periods, and the exact-amount table. Live may be empty. Check narrow-screen layout. Do not create another purchase solely to test the chart. Hosted visual verification and production query performance remain unverified until this owner check; the report currently scans matching order history on demand. Add measured optimization if actual catalog volume warrants it.
