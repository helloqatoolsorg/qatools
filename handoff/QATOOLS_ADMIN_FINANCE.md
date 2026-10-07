# qatools Admin Finance — 2026-10-07

Owner selected Finance from the feature backlog and paused further recovery testing. This batch adds a read-only report to the existing Admin sidebar and preserves Orders, checkout, refunds, ownership and licensing behavior.

## Metrics and limits

- Defaults to Sandbox with a prominent test-money notice. Live reads only `provider=paddle`; sandbox reads only `paddle_sandbox`. Live reporting does not enable or verify live payments.
- Each currency has its own totals/chart; no exchange rates or combined currency totals.
- Customer payments use stored actual `orders.total`, including tax where charged, for paid/refunded/partially_refunded orders. Pending/cancelled orders and free acquisition providers are excluded.
- Fully refunded orders contribute their original total once, including legacy orders whose item flags predate the current refund flow. Item refunds in partially refunded orders use recorded `unit_price * quantity` for fully refunded items. Bundles count as order lines, not constituent tools. Repurchases are separate orders.
- Remaining payments = customer payments minus recorded refunds. This is not merchant profit, tax-exclusive revenue, a Paddle balance, or payouts. Unsupported partial monetary refunds/disputes are not invented from order statuses and still require Payment review/Paddle reconciliation. Inconsistent stored item flags/amounts produce a visible review warning.
- Date basis: original provider completion date, falling back to local order creation date; UTC. Future-dated records are excluded. Refunds update the original purchase cohort, rather than being plotted on refund dates. No refund-date cash-flow claim is made.
- Last 30 days and last 3 calendar months use daily buckets. Last 6 and 12 calendar months use seven-day buckets anchored at the rolling period start, with a final partial week if needed. Every range includes today (UTC); 30 days means today plus the preceding 29 days. Month ranges start one day after the date 3/6/12 months ago. Zero buckets are filled and weekly date ranges are shown in tooltips/exact amounts. Lifetime and last-30-day summary amounts are independent of the chart selection.
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

## Owner follow-up: rolling graph periods and Finance pause

Owner reported the original deployed Finance section works and requested this final refinement before putting Finance aside. Removed 7-day option from the website/API. The SQL function retains the old `week` input for already-deployed callers during rollout only; no new UI uses it. Existing lifetime/refund/security semantics remain unchanged. The original migration is retained; `20261007221000_finance_rolling_periods.sql` replaces only the read-only report function. The current-month fields remain in the RPC for compatibility; the visible card now uses the separate last30DaysRemaining value.

Eight Finance tests passed with zero failures/skips, including real PostgreSQL zero-fill/count/UTC boundary and weekly-edge checks, authorization and rendered UI. Scoped lint and production build/TypeScript passed. Owner performs the new hosted graph check after this follow-up deployment. Further Finance work is explicitly paused.

Follow-up rollout (run one at a time, stop on an error):

```cmd
cd /d D:\qatools\qatools
supabase db push
git add src/components/AdminFinance.tsx src/app/api/admin/finance/route.ts src/lib/adminFinance.ts tests/finance.test.cjs supabase/migrations/20261007221000_finance_rolling_periods.sql handoff/QATOOLS_ADMIN_FINANCE.md handoff/QATOOLS_DEFERRED_ACTIONS.md
git commit -m "Use rolling daily and weekly finance charts"
git push
```

## Compact graph refinement

Owner requested all graph columns visible without internal horizontal scrolling. The graph now uses fluid columns with zero minimum width, a compact 180px plot, sparse start/middle/end date labels and CSS hover/focus value labels constrained within the chart. Every original data bucket remains present; no aggregation/window change. Zero-value buckets retain full-height hover/focus targets. Exact amounts remain available. No new SQL migration. Finance stays paused after this display refinement; owner hosted responsive review remains pending.
