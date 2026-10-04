# qatools current launch checkpoint — 2026-10-04

This checkpoint summarizes current observations; dated historical handoffs remain historical. Do not repeat completed owner uploads, purchases, refunds or password changes merely because an older document calls them pending.

## Owner-reported hosted checks passed

- Sandbox qafit01 purchase, purchased-item appearance, download, installation and activation.
- Approved full refund after replay identity correction: order refunded and retained in history, tool removed from Purchased products, online Houdini Refresh makes that tool inactive.
- Second-computer test: existing assignment blocks activation, admin release works, first computer becomes inactive after connected Refresh, second computer activates.
- Hosted forgot-password email redirects correctly after Supabase URL configuration changes; new password update and subsequent login succeed.

## Explicitly deferred

Second-computer offline restart/use check: owner is remotely connected and does not want to disconnect. Retain as a before-launch check. Multiple owned tools on one assignment and broader Houdini/OS compatibility need their own real-client coverage.

## Email delivery checkpoint

Owner configured Resend custom SMTP after verifying auth.qatools.org through Squarespace DNS, and confirmed a hosted reset email arrived from noreply@auth.qatools.org and opened Set new password. See QATOOLS_ACCOUNT_RECOVERY_CHECK.md. SMTP setup/reset delivery and fresh-account signup-confirmation delivery/redirect are complete per owner report. Resend UI inspection showed tracking not configured; no tracking subdomain was created. Wider deliverability remains unverified. Owner now confirmed ownership of qatools.org; website HTTPS at www.qatools.org and password-reset redirect there are owner-verified; root-to-www browser behavior and signup confirmation on the new origin remain follow-ups. No credentials stored.

## Remaining implementation/configuration scope

- Current paid checkout/catalog/fulfillment is sandbox-only and deliberately limited to qafit01, EUR5, one item. General catalog/multi-item purchase and live provider configuration need separate verified implementation; do not enable live payments from this checklist.
- Server licensing endpoints lack distributed request limiting in inspected source. Fresh production signing keys and deliberate verification continuity are required before public distribution; current staging clients pin the development public key.
- Ambiguous checkout handling is durable but operator reconciliation remains limited; approved full refunds are automated, other refund/dispute cases remain manual review under the current policy.
- Customer terms/privacy/refund wording and outstanding commercial choices remain in QATOOLS_POLICY_DECISIONS.md. No agreement published or acceptance claimed.
- Installation page still contains placeholder text. Owner previously reserved routine product/content uploads for themselves; content work should be guided and not silently filled with invented descriptions. Website domain is now www.qatools.org; actual support address still needs confirmation.
- Backup/secret continuity and production monitoring require a separate operational check.

This is a source/document review, not an external security audit or claim that public launch is ready. No remote state changed while creating this checkpoint. Email source: https://supabase.com/docs/guides/auth/auth-smtp .

## Latest owner checkpoint — 2026-10-04

Owner ran the licensing-domain update script: 21 tests and package verification passed; rebuilt ZIP points to https://www.qatools.org. Owner uploaded/redownloaded/installed and confirmed license Refresh succeeds. Owner then applied, built and deployed customer invoice downloads and confirmed the sandbox buyer's original invoice downloads successfully. Owner reports checkout styling now matches qatools. Receipt email and live invoice checks remain separate.

Owner authorized general sandbox cart support and chose qarand01 as the second paid tool. The coordinated source/migration/test batch is prepared in the chat workspace, pending mandatory isolated SQL checks, application, migrations, deployment, owner price setup and real multi-item payment/refund tests. See QATOOLS_SANDBOX_CART.md. The qafit01-only restriction is not claimed removed from the deployed site yet.

## Superseding cart checkpoint and admin setup request

Owner subsequently ran the cart batch successfully: 75 tests passed with zero skips, scoped lint, production build and diff checks passed. Both cart migrations were applied, code pushed, and Vercel Ready reported. General sandbox cart checkout is deployed per owner report; the actual hosted multi-item test is still pending. Owner chose another existing paid tool instead of qarand01 (not uploaded yet), and manually created its sandbox product/price; exact tool slug and price are still unknown here.

Owner requested simpler recurring tool setup. A new sandbox-only admin Set up Paddle price action is implemented locally with durable creation reservations, existing-product/price reuse and automatic verified mapping. Migration 20261004190000 must be applied before deploying this new batch. See QATOOLS_ADMIN_PADDLE_SETUP.md for verification and rollout. Live payments remain unsupported; tool uploads/content remain owner-operated.
