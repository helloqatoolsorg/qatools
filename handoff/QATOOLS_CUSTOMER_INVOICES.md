# Customer invoices — 2026-10-04

Owner approved adding Download invoice to customer order history using Paddle's PDF invoices. Store order references remain distinct from provider invoice numbers.

## Scope

- GET /api/account/invoice?orderId=<saved order ID> independently authenticates a confirmed Supabase account. A service-side query binds the stored order ID to that account's user ID before any provider request. The browser cannot supply an arbitrary transaction ID.
- Current scope is paddle_sandbox orders with positive totals and paid/refunded/partially_refunded status. Free, pending, cancelled, malformed and unsupported-provider orders fail closed. Original invoice access survives entitlement refund/revocation.
- Server retrieves a fresh attachment URL from Paddle GET /transactions/{transaction_id}/invoice on demand, using the existing server-only sandbox key (transaction.read required). Temporary URLs are not stored in profiles or localStorage. Responses are no-store. HTTPS URLs with embedded credentials are rejected. Provider/database errors expose no private details.
- Orders & Receipts shows a matching DOWNLOAD INVOICE action underneath the product name, preserving the existing four-column layout. Loading and retry errors are per order. No Supabase migration or new environment variable is required.
- This returns the original invoice; it does not create a refund credit note or a custom invoice numbering system. Billing details are collected by Paddle checkout; qatools profile invoice_details is not automatically forwarded by this change.

## Verification and rollout

Prepared in the chat workspace because project writes failed despite the filesystem grant. Not yet applied or deployed. 11 staged route/provider tests passed with no skips, including foreign-account access denial, missing/invalid/unconfirmed sessions, refunded access, unsupported/free orders, malformed provider responses and safe failures. Virtual project TypeScript check passed with staged sources. Three new production files pass ESLint; user/page.tsx retains the same eight errors and one warning as its pre-change baseline (all existing locations shifted by the new import). No broad account refactor was included.

The apply-invoice-update.ps1 script verifies source hashes, backs up replaced files, copies the six prepared source/test/document files, reruns the 11 tests, lints the three new production files, runs npm build and git diff --check. Production build and hosted PDF/receipt verification remain pending until these steps are reported successful.

Owner rollout: run the prepared script from a normal terminal; send the final output. Commit/push ONLY src/lib/paddleInvoice.ts, src/app/api/account/invoice/route.ts, src/components/OrderInvoice.tsx, src/app/user/page.tsx, tests/invoices.test.cjs, handoff/QATOOLS_CUSTOMER_INVOICES.md. Wait for Vercel Ready. On www.qatools.org, log in as the sandbox buyer and download the original PDF in Orders & Receipts; check amount/currency, tool and billing details against the saved transaction. Confirm receipt delivery separately from the purchase email. Use the existing refunded order if appropriate; no additional purchase/refund is required. Live invoices need future explicit live-provider support.

Reference: https://developer.paddle.com/api-reference/transactions/get-transaction-invoice/ (completed automatic transactions only; zero-value transactions excluded; PDF URL expires after one hour; transaction.read).
