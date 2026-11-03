# Account tool trials

Implemented locally on 3 November 2026. Not deployed. Owner validation and hosted checks remain required.

## Behavior

- Confirmed accounts can download published tools and bundles. Projects require active ownership.
- Key creation no longer requires a purchase. Downloading and generating a key do not start a trial.
- The first explicit activation from the new runtime starts one fixed 168-hour trial per account. Reinstallation, renewal, credential rotation and machine release do not restart it.
- Version 3 signed licenses distinguish owned tools, published free tools and published paid trial tools. The client checks the trial deadline independently of its renewable seven-day offline envelope.
- Free and owned tools survive trial expiry. Existing source-based bundle/refund ownership is unchanged. Trials create no commercial entitlements or orders.
- Unpaid download requests are counted as free downloads, including trial downloads. This counts requests, not completed transfers.
- Houdini Purchase tool opens /purchase?tool=slug, adds the item once and returns through login to the cart. No payment is automatic. Signed owned/free state disables the button on setup/activation/refresh.
- Older version 2 clients remain owned-only. They cannot use a trial; an updated runtime and explicit activation are required.

## Validation

64 website, cryptographic, API and isolated PostgreSQL checks passed before the migration was moved from pending to migrations. Python licensing (18 tests) and shared dialog (6 tests) passed. TypeScript passed. Scoped lint passed after the purchase-route adjustment (see latest terminal output).

The agent environment cannot launch hython (Windows Illegal System DLL Relocation), and Next's config compiler cannot canonicalize D:\qatools\qatools (access denied). These are not requirements to install a different stack. Run the prepared verification script in owner CMD:

```cmd
cd /d D:\qatools\qatools
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-account-trial.ps1
```

Stop on failure. Do not deploy before the real Houdini export tests and production build pass.

## Coordinated rollout after verification

1. Apply 20261103100000_account_tool_trials.sql using supabase db push.
2. Commit only this trial batch, then push and wait for Vercel Ready. No new secrets or paid services are required.
3. Install updated authoring via houdini\authoring\install-authoring.ps1 and restart Houdini. Prepare original authoring HDAs again to add the purchase button; prepared exports cannot be prepared again.
4. Upload the new prepared tool exports through admin. The website builder includes the updated shared licensing runtime. Reassemble affected bundles/projects through admin so their stored ZIPs include it too. Existing stored ZIPs are not retroactively changed by a website deploy.
5. Download and install the fresh package before testing activation. Old cached v2 licenses stay owned-only until explicit activation in the updated client. Do not clear account trials or rotate production signing keys.

Hosted acceptance: fresh confirmed account/key without ownership; download before activation; first activation starts trial; tools/bundles work; project download denied; purchase adds ownership after trusted payment; refresh enables purchased state; trial expiry removes only trial access; reactivation/machine release preserves dates. Use automated expiry tests rather than changing the operating-system clock.

## Limits

Offline enforcement uses the existing local clock model; it is not tamper-proof. Account deletion/recreation is a new account, and this feature does not add identity-based anti-abuse. A signing/network failure after activation commits may leave the trial started; retry preserves the same deadline. Actual Houdini UI/export and hosted browser checks remain pending until owner validation.
