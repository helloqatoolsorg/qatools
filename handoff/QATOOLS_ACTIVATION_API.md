# Account activation API — 2026-10-03

Status: owner reported the account-key flow working after the previous step (no separate migration log supplied). Reveal/Copy is implemented locally; migration 20261003020000 and live verification are pending. This is the account credential and machine-assignment step. It does not issue a signed offline license or change the working Houdini prototype.

## Account key management

GET /api/account/activation-key and POST /api/account/activation-key require a verified Supabase user access token in the Authorization Bearer header and confirmed email. The server derives the user ID from that token, never from request JSON or query parameters.

GET returns safe metadata (credential generation ID, key prefix, timestamps), or null when no key exists. The full key is retrieved only through the authenticated POST Reveal endpoint described below. Responses use Cache-Control: no-store.

POST JSON: `{ "expectedCredentialId": null }` creates the first credential. To replace it, send the current credential ID instead of null. Stale or duplicate submissions return 409. Creation/replacement requires at least one active entitlement and an available confirmed account.

The server generates 32 random bytes and formats the customer credential as QA_ followed by base64url. Creation returns metadata with reveal_available; the key stays masked until requested. SQL receives its SHA-256 hash, identifying prefix and an authenticated encrypted envelope. The full key returned by Reveal stays only in component memory (or the clipboard when the user explicitly copies it). No localStorage or sessionStorage key persistence is added. Hashing is suitable here because the credential has 256 bits of server-generated entropy; these are not user-selected passwords. Do not log Authorization headers, request secrets or key-creation response bodies.

Replacing the key invalidates the previous credential and changes its generation ID. Ownership and the current machine assignment remain intact. Activating the same machine with the new key updates its generation binding. Existing cached prototype licenses are unaffected. Lost-response recovery: refresh metadata and Reveal the saved key; never silently rotate it on retry. Historical hash-only credentials require one explicit replacement to become revealable.

## Shared machine activation

POST /api/licensing/activate requires the account activation credential in the Authorization Bearer header. JSON: `{ "machineId": "<existing QA Tools machine ID>" }`. The machine ID must match the prototype's 16 uppercase hexadecimal characters. Do not send an invented machine ID or use a browser-derived machine ID for an actual customer computer.

The server hashes the credential and calls a service-role-only SQL function. That function validates the current credential and account, checks active entitlements, and serializes operations per account. A repeated request for the same active machine returns the existing assignment. A different computer receives 409 until an admin releases the current one. A released/revoked history row is never overwritten; a subsequent explicit activation creates a new assignment.

A success contains activation metadata and every currently owned active product, not a client-supplied product list. Refunded/revoked and unowned products are excluded. No Houdini version is accepted as an authorization requirement or stored on the assignment.

The response includes `signedLicenseAvailable: false`. This is an online machine-assignment receipt, NOT proof that an HDA may run. Never use this unsigned receipt to bypass Ed25519 verification.

One future shared Houdini activation action will call this endpoint once for the account. Product ownership remains separate. Preserve the current machine-ID algorithm; use one cache location shared across tools and Houdini versions when implementing the client. Do not tie license storage to a version-specific Houdini preferences directory.

## Database boundaries

- account_activation_credentials: RLS enabled with no browser policies. No raw keys stored. Service role reads metadata columns only; direct hash/ciphertext reads are denied. A service-role-only function returns the encrypted envelope/hash for server-side decryption after owner authentication.
- set_account_activation_credential and activate_account_machine: SECURITY DEFINER with empty search_path; EXECUTE explicitly revoked from PUBLIC/anon/authenticated and granted only to service_role.
- Advisory transaction locks serialize credential creation/replacement and activation per account. The unique partial account_activations index is the final one-active-machine guard. Compare-and-set credential replacement protects against duplicate tabs/retries.
- Existing admin release remains conditional on active status and records actor/timestamp. Existing legacy history stays unchanged.

## Required next integration

- Connect the shared Houdini action; do not require activation once per HDA or per Houdini release.
- Define/version the product-aware Ed25519 license payload and use fresh production signing keys.
- Implement the agreed 30-day validity and background renewal. A renewal must validate the current credential generation, the exact activation ID, active status, machine ID, account availability and current product entitlements. It must NEVER create/reactivate an assignment or fall back to the activation endpoint on denial. A released machine's cached credential must not silently reclaim an empty slot.
- Handle verified revocation responses separately from transient network failure while a signed license remains valid. Preserve the approved delayed offline revocation behavior.
- Set up HTTPS, deployment request limits/rate limiting, and secret/header redaction before public exposure. No persistent distributed request limiter is included in this development milestone.
- Manual activation with a valid account key remains explicit; self-service machine release has not been added. Admin release is the current transfer procedure.

## Verification and operation

Run route tests with `node --test tests/admin-routes.test.cjs tests/licensing-routes.test.cjs`.

The database tests use an optional isolated @electric-sql/pglite runtime, never Supabase or a real customer database. Set PGLITE_TEST_MODULE to the installed module directory, then run `node --test tests/licensing-database.test.cjs`. Without the environment variable, those database tests are explicitly skipped. No test package was added to production dependencies.

The database suite executes both account migrations and tests privilege denial, own-row RLS, migration rollback on conflicting legacy machines, credential replacement, all-owned-products activation, single-machine enforcement, release/reassignment history, banned accounts and revoked entitlements. Its in-process runtime does not simulate multiple PostgreSQL connections; production lock-contention/load testing remains separate.

Apply the pending migration with `supabase db push` in the owner's authenticated terminal. Afterward, open /user?section=license, create a key and save it privately. Reload: only its prefix should remain until Reveal or Copy is clicked; Reveal retrieves the same saved key. The existing admin release/history and ownership displays should continue working. Live Houdini activation is a later integration check.

Verification completion: production build passed. All 41 route tests and 10 isolated PostgreSQL tests passed. Actual localhost GET/POST key-management and POST activation requests without credentials returned 401 with Cache-Control: no-store. Authenticated live creation and remote migration remain pending.

## Reveal and Copy — owner-approved change, 2026-10-03

POST /api/account/activation-key/reveal requires the user's verified, confirmed Supabase session and JSON containing credentialId. The server derives user_id from the verified session, calls get_account_activation_secret for that account and expected generation, then decrypts the result server-side. Neither supplying another user ID nor another credential generation can retrieve that other user's key. The SQL function also rejects banned/unconfirmed/unavailable accounts. Reveal does not require current product ownership; activation still does.

The response contains only the full key and credentialId, with Cache-Control: no-store. Metadata requests never include the full key or encrypted envelope. Reveal and Copy work again after a reload/login. Both require the current account session; no additional password prompt was selected. The component is unmounted on leaving License Data or changing users, clearing its revealed state. Copy places the value on the user's clipboard only on explicit request.

Storage uses AES-256-GCM with a fresh 12-byte random nonce and 16-byte authentication tag. A versioned envelope stores ciphertext, nonce and tag. Additional authenticated data binds it to the user ID. After decryption, the current stored credential hash is verified to reject stale/substituted data. Existing hash-based activation verification is unchanged. Neither this cipher nor its key is the Ed25519 licensing signing system.

New server-only configuration: QATOOLS_ACTIVATION_ENCRYPTION_KEY must be a canonical base64-encoded 32-byte random value. A separate random local value was generated directly into ignored .env.local without being printed. Restart the dev server after configuration changes. Never prefix it with NEXT_PUBLIC_, publish it, or send it in chat. Missing/invalid configuration prevents creation before a database write and makes Reveal fail closed.

Preserve/back up that encryption value separately from the database and add it securely to the production server's environment when deploying. Do not casually regenerate it: existing encrypted keys depend on it. Rotation requires a deliberate server-side decrypt/re-encrypt migration and retained access to the old key; this milestone does not implement multi-key rotation. Losing it requires explicit replacement of affected customer activation keys, not an automatic silent reset.

Migration 20261003020000_reveal_activation_keys.sql adds nullable encrypted_key and generated reveal_available, replaces the old four-argument credential writer with a five-argument writer that requires encrypted data, and adds the restricted retrieval function. Creation/replacement stores hash and ciphertext atomically. Legacy hash-only rows and machine assignments remain unchanged and readable as metadata. Their original full values cannot be recovered, so the UI requests one deliberate replacement. An old server deployment must be upgraded with this migration because the hash-only writer is retired.

The owner reported the previous key flow working. The Reveal migration has not been applied by the agent. Apply it from the owner's authenticated terminal, restart npm run dev, replace an old key once, then verify Reveal/Copy/Hide and repeat after reloading. Do not paste actual customer keys into test output or chat.

Reveal verification: production build passed; 50 route/crypto/admin tests and 12 isolated PostgreSQL tests passed. The actual local Reveal endpoint returned 401 and no-store without login. Remote Reveal migration and authenticated browser verification are still pending.

## Current status update — signed licenses, 2026-10-03

The owner subsequently confirmed Reveal/Copy working. This supersedes the earlier pending UI verification above; the agent did not apply the remote migration. No customer key replacement is required for this new step.

Activation now requires signing configuration and returns a version-2 Ed25519 envelope scoped to all active owned product slugs with 30-day expiry. Renewal is implemented at POST /api/licensing/renew using signed proof, machineId and a request nonce, without the account activation key. The service-role-only renew_account_license function rechecks the exact active assignment, credential generation, account availability and ownership. It cannot activate or reclaim a machine.

Migration 20261003030000_signed_license_renewal.sql is locally tested and awaits the owner's supabase db push. Restart the website after applying it. The shared Python client and HDA bridge are prepared in houdini/ but are not installed in the user's Houdini package. The installed HDA still uses the original prototype. See QATOOLS_SIGNED_LICENSE_V2.md for the protocol, tests, configuration and remaining integration work.
