# Tool creation and trial experience — 4 November 2026

Implemented locally; not deployed. Includes the naming/dialog/compatibility changes following commit 45a0762.

## Approved behavior

- The icon browse field is for the Houdini node, not the website card. Optional PNG, at most 1 MB, embedded in the exported HDA. Original source is unchanged. Leaving it empty keeps the source icon.
- Export folder and selected icon file persist locally through Qt settings (qatools/dev-export). Both Browse selections and accepted manual entries are remembered. There are no changes to website media.
- License remains a separate tab. A signed-trial countdown displays remaining calendar-sized 24-hour periods rounded up; it does not extend the deadline. It disappears for signed owned/free tools. Expired/unavailable proofs cannot grant access or invent a deadline. Refresh after purchasing updates the signed ownership and visibility.
- Admin editor has an explicit Use test data checkbox, initially off. It fills empty subtitle/description/compatibility/version and non-tool titles, and selects random active category/complexity if missing. It preserves entered fields and automated identity. Price, files and included tools stay manual. No save or publication happens automatically. Unchecking does not undo entered placeholders.
- Product page Free download sits left of Add to cart for tools/bundles. Owned products show Download, including projects. A logged-out click opens the existing login popup; success resumes that download once. Escape/outside cancellation cancels the pending request. Duplicate clicks are blocked. Download authorization remains on the existing confirmed-account server endpoint; projects remain purchase-only.
- Terms and installation instructions describe the shared 168-hour trial, start on activation, project exclusion, offline deadline, no automatic charge, and retained trial dates. Existing refund rights are unchanged.

## Validation and rollout

TypeScript and scoped lint of new download/editor/terms code pass. Signed licensing and countdown tests: 19 passed. Shared dialog tests: 6 passed. Flow tests cover login resumption, cancellation, duplicate clicks and server denial. Existing UserMenu reset-effect and legacy page anchor/image lint findings predate this batch; these are not a production-build result.

Real Houdini export checks now include icon embedding/source preservation and the Tool/License tab layout. The agent cannot launch hython (Windows DLL relocation) or the Next config compiler on D: (sandbox canonicalization error). Owner should run all final checks once:

```cmd
cd /d D:\qatools\qatools
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-tool-experience.ps1
```

Do not deploy on a failed check. No new database migration or environment variable is required. Once verified, commit the scoped website/editor/runtime/authoring files and this handoff; push and wait for Ready. Close Houdini and run both houdini\authoring\install-authoring.ps1 and houdini\authoring\update-local-runtime.ps1, then restart. Re-export from originals, upload replacements via admin, and rebuild affected bundles/projects to refresh stored ZIP runtime and icon/tab additions. Older ZIPs and installed HDAs do not change automatically.

Owner visual checks: icon appears on a newly created exported node after moving/removing the original PNG; reopening exporter recalls both paths; licence trial text hides after a successful purchase refresh; editor test data preserves existing entries; Free download popup works on desktop/mobile and a confirmed login triggers only one file. GUI behavior has not been visually verified by the agent.

## Owner verification completed — 4 November 2026
Owner ran verify-tool-experience.ps1 successfully: 19 website tests passed, one optional isolated database test skipped, Python suites passed 19 + 6 + 1 + 8 + 7 tests, and Next production build passed. This supersedes the pending automated/Houdini checks above. Hosted GUI review, commit/push, installed-runtime/shelf updates and re-export/upload remain pending. No migration is required.
