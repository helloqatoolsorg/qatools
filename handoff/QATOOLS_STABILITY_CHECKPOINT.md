# qatools stability checkpoint — 2026-10-07

## Current decision and verified behavior

Owner approved deferring customer Download selection. Preserve individual download installers and saved, automatically assembled bundle installers. Projects and Finance remain separate pending features.

Owner reports hosted sandbox bundle purchase/download/install/account activation, independent-tool ownership after bundle refund, bundle repurchase and the grouped Purchased products display all working. These are owner-reported hosted checks, distinct from local automated tests. Live Paddle payments remain unverified.

## Local regression evidence

- `node --test tests/*.test.cjs` with the configured PGlite runtime: 280 passed, zero failed, zero skipped. Coverage includes real isolated PostgreSQL migrations, commercial ownership/origins, refunds/repurchases, account grouping, authorization, invoice access, private downloads, package validation, draft/publication gates and provider processing.
- Houdini 22.0.459 `hython -m unittest discover -s tests -p 'test_*.py'` with isolated preferences and repository Python modules: 33 passed. Tests use temporary source HDAs and synthetic signed caches, including offline verification, guarded geometry, authoring and shared refresh behavior.
- Initial plain Python discovery could not import `hou` for two test modules; rerunning with Houdini's runner resolved this. The first Houdini preferences path was rejected because it lacked `__HVER__`; the final passing run used a correctly isolated preferences path. No installed HDA or account cache was edited.
- Houdini emitted the previously recorded WindowsApps/USD import permission warning during startup. Functional tests completed with exit code 0; broader USD/environment compatibility is not certified by this run.
- No application code changed, so no additional production build was run. No hosted database, product, purchase, secret, signing key or deployment was changed. This is regression verification, not a security audit or live launch certification.

## Next stability batch

LIC-04: distributed request limiting for `/api/licensing/activate` and `/api/licensing/renew`. Current route inspection confirms neither uses a limiter. Implement and test an atomic shared mechanism suitable for multiple server instances. Bound requests before expensive privileged work; never log raw keys or proofs. Treat throttling as a temporary failure so a valid offline cache is preserved. Do not change signature format, machine identity, product ownership or the approved offline policy.

Other pre-launch dependencies remain in QATOOLS_DEFERRED_ACTIONS.md: deliberate production signing-key continuity, live Paddle configuration/verification, backup/restore and monitoring, legal/support details, installation content, wider email and platform coverage. The second-computer offline restart remains intentionally deferred while the owner is remotely connected.


## Licensing stability batch prepared — 2026-10-07

Distributed activation/renewal limiting and the owner-approved seven-day client transition are implemented locally. 286 Node tests and 35 Houdini tests passed, scoped lint and production build passed. Owner migration/deployment, installed client update and hosted installer replacement remain pending. Existing old clients retain compatibility; retiring legacy 30-day issuance is a deliberate later rollout step. See QATOOLS_LICENSING_LIMITS_7DAY.md for exact scope, limits and rollout instructions.
