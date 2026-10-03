# QA Tools signed offline license v2 — 2026-10-03

## Status

Website signing/renewal and the shared Python client are implemented and locally tested. Migration `20261003030000_signed_license_renewal.sql` still needs the owner's authenticated `supabase db push`. The installed `qafit01_online.hdalc` has not been modified. No live Houdini cooking, activation or second-computer transfer test is claimed for this milestone.

The owner reported the account credential and Reveal/Copy flows working. Their earlier pending-verification notes are historical. No account key replacement is needed for v2.

## One account, one machine, all owned tools

Explicit activation sends the existing account key in an Authorization header and the stable machine ID in JSON. The server checks the credential hash and atomically assigns or reuses the account machine. A different active computer still requires admin release. The response lists all active owned products and includes one signed proof. Ownership remains in `entitlements`.

Machine ID deliberately preserves the prototype algorithm: first 16 uppercase hex characters of SHA-256 of `platform.node() + platform.system() + platform.machine()`. No Houdini release participates. Changing a hostname/OS/architecture can change this identifier; it is not a secret or tamper-resistant hardware attestation.

The shared cache lives at `%LOCALAPPDATA%\QATools\licenses\account-v2.json` on Windows (Application Support on macOS, XDG data home on Linux). It contains signed proof, last renewal attempt and any signed denial, never the account key. Atomic replacement protects against interrupted writes; OS locking serializes simultaneous client operations. The HDA bridge delegates product authorization to the shared client.

## Signed format and trust

Envelope: `{ "payload": "<base64url bytes>", "signature": "<base64url Ed25519 signature>" }`. Encodings are canonical and unpadded. Signatures cover the exact UTF-8 JSON payload bytes, not client-reconstructed JSON.

License payload fields:

| Field | Meaning |
| --- | --- |
| vendor, version, kind | `qatools`, `2`, `license` |
| keyId | Public-key selector; must resolve to a pinned trusted key |
| activationId | Exact account assignment, positive integer encoded as a string |
| credentialId | Current account-key generation UUID |
| machineId | Stable machine identifier |
| products | Explicit owned product slugs, never `ALL` |
| issuedAt, expiresAt | UTC Unix seconds; exactly 30 days apart |

The client verifies signature, purpose, vendor, version, identity, product membership and time bounds. It accepts no unsigned receipt or old perpetual `ALL` proof. Existing prototype license files are retained but cannot authorize v2. Public keys are safe to distribute; signing private keys stay exclusively on the server.

## Renewal and revocation

`POST /api/licensing/renew` accepts the signed envelope, machine ID and fresh 16-byte nonce (32 lowercase hex characters). It accepts a genuine expired proof for renewal only. Before signing, the server calls the restricted SQL function to verify the exact active assignment, current credential generation, confirmed/non-banned account and current active ownership. Renewal cannot create, reactivate or release assignments and does not need the account key.

Client startup prepares one background attempt at most once every 24 hours, shared across sessions and Houdini releases. A failed attempt counts toward that interval. Manual refresh bypasses the interval. Normal cooking invokes only local verification; no per-cook network request occurs.

Network failures and unsigned server errors retain the old cache, which remains usable only until its original expiry. A trusted terminal denial is itself signed and bound to the proof SHA-256 digest and request nonce; the response must be fresh within five minutes. Denial reasons are `assignment_inactive`, `credential_changed`, `account_unavailable`, and `no_entitlements`. Verified denial is persisted and blocks further use/automatic renewal of that cache. Explicit reactivation remains a user action.

Releasing an offline computer cannot instantly erase its cached proof. The old machine can work until its next successful status check or remaining 30-day expiry. Revoking one product updates the product list on renewal; other still-owned products continue. A new computer gets a new assignment after release, and one activation covers every owned tool. No ownership or history is erased.

## Files and development configuration

- `src/lib/signedLicense.ts`: server-only signing, verification and signed denial creation.
- `src/app/api/licensing/activate/route.ts`: account-key activation plus signed proof.
- `src/app/api/licensing/renew/route.ts`: signed proof renewal and denial.
- `supabase/migrations/20261003030000_signed_license_renewal.sql`: service-role-only state recheck; browser roles have no EXECUTE privilege.
- `houdini/python/qatools_licensing/`: shared client, public configuration and Houdini activation UI.
- `houdini/hda-bridge/qafit01_PythonModule.py`: prepared bridge for existing guard/callback names.
- `houdini/scripts/pythonrc.py`: prepared startup hook; not installed yet.

Ignored `.env.local` has a new **development-only** `QATOOLS_LICENSE_SIGNING_KEY` (base64 PKCS#8 DER Ed25519 private key) and `QATOOLS_LICENSE_SIGNING_KEY_ID`. The client `config.py` contains only the matching public key and localhost development URL. Preserve these local values; do not publish them or regenerate them casually. They are independent of `QATOOLS_ACTIVATION_ENCRYPTION_KEY` and the old FastAPI signing key.

Production requires a fresh production key pair, HTTPS server URL and distributed request limits/redacted logging. Never expose a private signing/encryption value through `NEXT_PUBLIC_`, HDA parameters, cache files or chat. The current server trusts its configured signing key only; production rotation must preserve verification continuity deliberately. Multi-key rotation and longer offline grants are not implemented.

## Verification completed

- Production Next.js build and TypeScript compilation passed.
- 57 route/admin/crypto tests passed, including actual Node-to-Houdini-Python signature interoperability.
- 12 isolated PostgreSQL tests passed using PGlite: real migrations, function privileges, RLS, current generation/assignment checks, NULL/mismatched identifiers, release history and single-machine enforcement.
- 14 Python tests passed: product scope, tampering, wrong machine/key, expiry, renewal, signed/replayed denials, unsigned outages, daily attempts across sessions and interrupted cache writes.

Tests use synthetic keys and isolated state, never the live account key or remote customer database. PGlite does not simulate multi-connection contention. Python tests do not prove that an actual HDA invokes its guard during cooking. Houdini UI callbacks and background startup must be checked in Houdini after installation.

Run route tests: `node --test tests/admin-routes.test.cjs tests/licensing-routes.test.cjs`. Interoperability uses `HOUDINI_PYTHON` or the installed Houdini 22.0.459 Python path; otherwise explicitly skips that test. Database tests require `PGLITE_TEST_MODULE` pointing to the isolated test runtime. Python tests need the `houdini/python` directory on `PYTHONPATH` and `cryptography` installed.

## Next live step

1. In the owner's terminal at `D:\qatools\qatools`, run `supabase db push`. Expected new migration: `20261003030000_signed_license_renewal.sql`.
2. Restart `npm run dev` so signing environment is loaded.
3. Back up the installed HDA; install the shared Python client and startup hook in the QA Tools package. Integrate the bridge with the existing qafit01 guard and activation UI while preserving its network and parameters. Remove reliance on old email/purchase-token inputs; do not save account keys in the HIP.
4. Activate once using the existing account key and verify qafit01 cooking, public product scope, expiry display, offline use and manual refresh.
5. Release through the existing admin action, verify connected old-machine denial, activate the second computer once for all owned tools, and confirm retained ownership/history. Test offline overlap separately.

This milestone stops before installed HDA changes because the remote renewal function is not yet available. Account-key replacement and starting the old FastAPI server are not required.

## Remaining limits and decisions

The hostname-based machine ID and local Python guard can be copied or modified by a determined user. Local clock manipulation and cached proof rollback are not solved by signatures alone. Product expiry is checked when the guard is invoked; this does not terminate an already-running render or guarantee recooking an already-cached Houdini node. Long-running/headless rendering policy, recheck behavior, extended offline grants and emergency/shutdown licensing need explicit design and tests. Agreement wording must describe the verified implementation and approved offline overlap accurately.


## Installed integration update

The shared client, startup hook and HDA bridge are now installed and actual synthetic SOP cook checks passed. The original guard was found bypassed and enabled. See QATOOLS_HOUDINI_INTEGRATION_2026-10-03.md for current status, backup and live checks; this supersedes earlier installed-HDA pending statements. Real account activation and transfer remain pending.
