# Licensing request limits and seven-day client transition — 2026-10-07

## Approved behavior and implementation

Owner approved changing the offline allowance from 30 days to 7 days alongside licensing request limiting. Source implementation is complete locally; migration, website deployment, installed-client updates and hosted installer replacement are owner rollout steps. No deployed change is claimed.

The updated client advertises `offlineDays: 7` for activation and renewal. The server signs seven-day proofs for that client; signature, machine identity, account assignment, product scope and signed payload version stay unchanged. Automatic startup renewal keeps its existing once-per-day attempt limit; ordinary node cooking remains local. A user must connect and successfully renew within seven days of the last successful issuance to keep working after expiry. No expiry countdown is added to the UI.

Compatibility is deliberate: old installed clients enforce exactly 30 days, so requests without the new capability still receive 30-day proofs. Both server and updated client accept authentic seven-day and legacy 30-day proofs; any other duration is rejected. Existing proofs keep their signed expiry. This is a transitional seven-day policy, not universal seven-day enforcement until all client installers are updated and legacy issuance is deliberately retired in a later coordinated step. An attacker can omit the capability, so this negotiation must not be described as strict seven-day enforcement.

## Request limiting

Migration `20261007210000_licensing_request_limits.sql` creates private RLS-protected counters and a service-role-only SECURITY DEFINER RPC. Database UPSERTs atomically share fixed one-minute windows across server instances. Limits:

| Endpoint | Network/IP | Credential/assignment |
| --- | --- | --- |
| Activation | 60 requests/minute | 10 requests/minute per activation key |
| Renewal | 120 requests/minute | 30 requests/minute per verified signed assignment |

Network limiting runs before parsing, signature work or ownership/assignment queries. Credential/assignment limiting follows input validation; renewal identities come only from verified signed proofs. Credentials, proofs and raw IPs are never stored in limiter rows: subjects are HMAC-SHA256 with the existing server-only service-role secret. Rotating that secret resets bucket identity. Counters cap at limit + 1; rejected requests do not extend a window. Bounded cleanup removes up to 200 rows inactive for over a day per call; residual idle hashes may remain while traffic is absent.

Vercel's overwritten `x-forwarded-for` is trusted only when the server's VERCEL environment is 1. Exactly one valid IP is required; missing/invalid headers fail closed. Local development ignores forwarding headers and shares a development bucket. A production deployment on another hosting platform fails closed until its trusted network identity is explicitly implemented. No externally configured trusted proxy is assumed. Source: [Vercel request headers](https://vercel.com/docs/headers/request-headers).

Excessive requests return private/no-store HTTP 429 with Retry-After. Database/configuration failures return unsigned HTTP 503. Neither is a signed revocation; the client retains its valid offline proof. Activation throttling is reported as temporary. This protects application/database work, not network-layer DDoS; WAF/provider operational coverage remains a separate task.

## Verification

- 286 Node tests passed, zero failures/skips, including isolated PostgreSQL permissions, fixed-window counts/reset/cleanup and overlapping requests; route ordering, safe failures, hashing, trusted-header behavior, legacy transition and actual Node-signed proof verification with Houdini Python.
- 35 real Houdini/Python tests passed, including expiry boundary, shared offline operation, cache preservation on throttling/outage, legacy-to-seven-day renewal and capability fields. Existing WindowsApps/USD startup warning is unchanged and did not prevent completion.
- Scoped server/helper lint and full production build/TypeScript passed.
- Shared-client update ZIP verified by exact manifest, byte comparison and CRC. Six entries, no HDAs, credentials, caches or private signing keys. Public development verifier is unchanged. SHA256: 399ed07ede5f275346ed6bf0f0e9eff9783c5ff9c4a26eacb9559f38a46fadec.

## Owner rollout — CMD

Run each line after the preceding line succeeds. Apply the migration before deploying routes, otherwise the limiter correctly makes licensing temporarily unavailable. Stage only these files; unrelated earlier work remains outside this commit.

```cmd
cd /d D:\qatools\qatools
supabase db push
git add src/lib/licensingRequestLimit.ts src/lib/signedLicense.ts src/lib/database.types.ts src/app/api/licensing/activate/route.ts src/app/api/licensing/renew/route.ts houdini/python/qatools_licensing/client.py tests/licensing-request-limits.test.cjs tests/licensing-routes.test.cjs tests/test_houdini_licensing.py handoff/QATOOLS_LICENSING_LIMITS_7DAY.md handoff/QATOOLS_POLICY_DECISIONS.md handoff/QATOOLS_DEFERRED_ACTIONS.md handoff/QATOOLS_FEATURE_BACKLOG.md handoff/QATOOLS_STABILITY_CHECKPOINT.md
git commit -m "Limit licensing requests and introduce seven-day renewals"
git push
```

After Vercel Ready:

1. Close Houdini on the test computer. Back up its current `packages/qatools/python3.13libs/qatools_licensing` folder, `packages/qatools/scripts/pythonrc.py` and `packages/qatools.json` before replacement. Existing tools and licenses remain in place.
2. Extract `C:\Users\quima\Documents\Codex\2026-10-02\i-was-building-step-by-step\qatools-licensing-7day-update.zip`. Merge its qatools folder into `C:\Users\quima\Documents\houdini22.0\packages\qatools` and put qatools.json in the parent packages folder. Replace the matching shared runtime files; do not replace/delete the entire existing qatools folder or its otls. Do not clear the account cache. This ZIP is a shared runtime update, not a product ZIP for admin upload.
3. Restart Houdini and click Refresh once. Confirm an owned tool stays active. This updated client now asks for seven-day proofs; its key and account machine do not need reassignment. Hosted seven-day proof/throttling verification is still pending.
4. Refresh customer installers after website deployment: for each prepared individual tool, reupload its original prepared ZIP via Replace prepared tool ZIP; the server inserts the current shared runtime. For a legacy raw HDA, use Upload Houdini tool to rebuild the installer from the same HDA. Rebuild every bundle installer explicitly; existing stored releases never silently change. Owner performs these normal upload actions. Do not upload the runtime-only ZIP as a tool or substitute one tool's HDA for another.
5. Download/install an actual refreshed product and confirm Refresh works before declaring customer rollout complete. Previously installed clients continue using the compatibility allowance until updated. Retiring legacy 30-day issuance remains a follow-up after installer coverage is confirmed.

No remote SQL, commit, push, deployment or installed-Houdini mutation was performed by the agent. Product files, membership, commercial ownership, signing keys and machine algorithm were not changed by this batch.
