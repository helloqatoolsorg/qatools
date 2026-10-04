# qatools customer order numbers — 2026-10-04

Owner approved separate customer order numbers, retained internal IDs, separate sandbox numbering and retention of refunded/cancelled orders.

## Hosted order numbering confirmed by owner

`20261004120000_customer_order_numbers.sql` adds nullable unique `orders.order_number`. Confirmed orders (paid, refunded, partially_refunded) receive a number automatically. Pending or cancelled-before-confirmation records remain unnumbered. Once assigned, a number remains through later status changes, including cancellation. Existing confirmed history is backfilled chronologically without changing IDs, ownership, amounts or provider references.

- Live provider `paddle`: `000001`, `000002`, …
- Sandbox provider `paddle_sandbox`: `sandbox-000001`, …
- Historical development provider `development`: `development-000001`, …
- Unsupported providers fail closed when confirming an order.

The current development and sandbox purchases therefore each become number 1 in their own series. Database IDs #1 and #3 stay internal. Future live numbering starts independently at 000001. These are qatools order references, not Paddle invoice numbers.

Counters use ordinary transactional rows. An AFTER-row trigger allocates only for an actual confirmed insertion or confirmation update, avoiding sequence gaps and ignored ON CONFLICT inserts. Counter updates serialize on the corresponding scope row and roll back with the entire purchase transaction. A later fulfillment failure also rolls back the allocation. Number width expands beyond six digits.

Assigned numbers, providers and internal IDs cannot be changed; numbered orders cannot be deleted and orders cannot be truncated. Use statuses to retain history. Privileged database owners can still disable triggers or alter counters, so operational changes must preserve this rule. Review account deletion/anonymization separately before launch; this change does not define a personal-data retention policy.

Counter table has RLS and no browser/service-role grants. Trigger functions have no direct browser/service-role EXECUTE permission. Existing order access policies and payment authority are unchanged. The admin list and account order history display the saved reference; unconfirmed records show “Not numbered.” Filtering or pagination can hide intermediate numbers without indicating lost records.

## Verification

Owner reported applying the migration, deploying the order displays and confirming they work on 2026-10-04. A subsequent local display change pads references to five digits (`00001`, `sandbox-00001`, `development-00001`) without changing immutable stored references, counters or purchase history. This cosmetic update awaits deployment and requires no SQL migration.

Production Next.js build and TypeScript compilation passed. All 18 targeted order/payment tests passed with PostgreSQL fixtures enabled; no tests were skipped. `git diff --check` passed.

Isolated PostgreSQL tests cover backfill, separate series, pending confirmation, conflicting duplicate inserts, rollback, failure after allocation, refund/cancellation retention, immutable numbers, deletion/truncation guards, permissions and seven-digit padding. Existing trusted Paddle fulfillment tests also execute this migration and verify duplicate events preserve the assigned sandbox number. These tests do not perform a live purchase or simulate concurrent PostgreSQL connections.

## Original owner rollout (owner reports completed)

1. Run `supabase db push` from `D:\qatools\qatools`; expected new migration is `20261004120000_customer_order_numbers.sql`.
2. Commit/push the exact files for this change; Vercel deploys main.
3. After Ready, check admin orders and the purchasing account history. Do not make another purchase merely to verify the backfill.

The owner reports the remote migration and original deployment completed successfully. The five-digit display update remains local. No remote migration or deployment has been performed by the agent for this change.
