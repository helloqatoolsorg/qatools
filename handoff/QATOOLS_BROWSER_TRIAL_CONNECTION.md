# Browser trial connection and License tab — 4 November 2026

Superseded for new HDA UX by QATOOLS_INDIVIDUAL_TOOL_TRIALS.md. Use verify-tool-trials.ps1 for the combined batch. Browser pairing endpoints remain for older-export compatibility; the new tab uses one-time masked account-key activation and automatic individual tool trials.

## Implemented behavior

The Start free trial / Connect account button opens a browser approval page. The user logs in if necessary and explicitly confirms the matching machine and six-digit code. No activation key needs to be copied. Existing key activation and Refresh remain available.

A high-entropy device token stays only in Houdini process memory; only its SHA-256 hash is stored on the server. It is never in a URL, HDA, HIP, ZIP or license cache. The browser receives only a request ID. Server requests expire after five minutes, and both device token and machine must match. Browser approval requires the existing confirmed account authentication. Database RPCs are service-only; browser roles have no table access. Existing encrypted recoverable account credentials are reused, or created with the existing compare-and-set mechanism. No signing keys or machine-ID algorithm changes.

Only a successful device claim activates a machine and starts the existing fixed 168-hour account trial. Starting a request, viewing a page or downloading does not start it. Reconnection, repeated claims, reinstalling, clearing local cache and key rotation do not restart the deadline. A different active machine is still rejected. Signed license checks remain local during HDA cooking.

After trial expiry, an unowned paid tool fails with: “Trial ended - activate license for this tool. Choose Purchase tool if needed, then activate or refresh your license.” Purchased/free tools retain existing access. The purchase button disables and countdown hides only for purchased/free tools; trial activation is not paid ownership. Cache expiry, tampering and network failures still fail closed.

The License tab has colored active/inactive headings with the tick/cross; unchanged email/machine/date; a separator above a horizontal License key activation / Clear local license row; connection button while disconnected; day-count heading; and a separate Purchase tool box. Clear local license remains accurately named: it clears this computer's cache, not the server assignment. Server machine release is still a separate supported operation.

## One coordinated rollout

1. Run `scripts/verify-browser-trial.ps1 -Stage` in the repository. It includes actual hython export tests and production build. Do not proceed on failure.
2. Apply `20261104120000_houdini_browser_connection.sql` using `supabase db push`.
3. Commit and push the staged batch. Wait for Vercel Ready before using the new button. No new environment secrets or services.
4. Run `houdini/authoring/install-authoring.ps1` and `houdini/authoring/update-local-runtime.ps1`, restart Houdini.
5. Re-export the editable original development HDA to include the new tab/button layout; replace its prepared ZIP through admin using the exact same filename, then Update product. Rebuild dependent bundles/projects. Website deployment does not rewrite stored packages.
6. Download/install the fresh package. Use a fresh confirmed test account for the full seven days; an existing account's trial is intentionally not reset. Start free trial; confirm matching machine/code in browser; watch this tool and other placed tools recook. Test purchase + Refresh separately; validate expiry using tests rather than changing the system clock.

This batch includes the pending isolated authoring worker and its installer/tests because the current utility depends on them. Source HDAs remain editable and only exported copies are black-boxed.

## Validation limits

API, signed-client and isolated PostgreSQL tests cover missing auth, signing configuration, rate limits, pending/expired requests, wrong token/machine, approval belonging to another account, retries preserving trial deadline, existing key preservation and unchanged free/purchased access. Native Houdini tests are supplied for owner execution: the agent cannot launch hython in its Windows process environment. Visual heading color/spacing and Qt browser interaction must be checked in Houdini 22 Indie. Native heading and joined-button APIs follow SideFX HOM documentation; no application-wide stylesheet is changed.
