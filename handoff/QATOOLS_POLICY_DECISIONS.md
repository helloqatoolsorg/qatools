# QA Tools — Commercial and licensing policy decisions

Updated: 2026-10-04

## Fixed bundle pricing and download counts — owner clarification, 2026-10-04

- Bundles are groups of tools with one fixed price cheaper than the sum of their individual prices. Already-owned tools do not reduce the bundle price. Grant missing constituent ownership and retain previously owned tools without duplicate ownership. This supersedes the agent's earlier remaining-tools-only pricing proposal; that proposal was not implemented.
- Before implementing bundle refunds, preserve attribution to independent purchases: refunding a bundle must not remove a tool owned through an earlier independent acquisition. Detailed bundle refund/versioning and fully-owned bundle purchase behavior remain open.
- Free acquisitions must not create orders. Owner wants comparable free and paid download counts and delegated implementation details. Selected metric: successful authorized download requests, repeats included, classified by acquisition source rather than current product price. This measures download requests, not confirmed transfer completion. Future bulk requests count each included tool once after successful archive preparation/link issuance; failed requests do not count. Recording is pending implementation.
- See QATOOLS_FEATURE_BACKLOG.md for implementation scope. No bundle pricing, ownership or download-counter code was changed by this decision record.
Purpose: internal source material for future customer terms, license agreement, purchase disclosures, support documentation and privacy review.
Status: decision record, NOT a published agreement or customer acceptance record.

## Approved full-refund access rule — 2026-10-04

Owner explicitly approved marking a fully refunded tool's ownership refunded after provider approval, blocking downloads and future license renewals for that tool. Existing offline proofs remain valid until a successful check removes that product or expiry. Other owned tools and account machine assignment remain intact. Local sandbox implementation is in `20261004130000_sandbox_full_refunds.sql`; migration/deployment and real sandbox refund verification remain pending. Partial/pending refunds and disputes remain manual review; no automatic reinstatement or general refund eligibility policy was approved. See `QATOOLS_PAYMENT_OPERATIONS.md` for the batch scope and remaining checks.

Implementation clarification following the owner's sandbox test: Paddle may label a fully refunded single-item order's adjustment `partial`, with the item scope `full`. Exact entire-order amount and binding checks determine eligibility; the provider's adjustment label alone does not define the approved commercial policy. Correction and safe signed-replay support are in `20261004140000_recheck_approved_refund_events.sql`, pending rollout. Smaller refunds remain manual review.

## Working record instructions

- Record each material decision with its date, source, implementation status and unresolved details.
- Distinguish owner-approved product policy from suggestions and historical descriptions.
- Preserve dated decisions when revising them; mark replacements explicitly. Do not silently turn proposals into contractual promises.
- The repository remains the source of truth for actual behavior. Confirm implementation before drafting customer-facing promises.
- Do not include passwords, account activation credentials, signing secrets, customer records or private reset links.

## Order numbering — owner approval, 2026-10-04

Separate customer-facing order numbers from internal database IDs. Assign numbers transactionally to confirmed orders so failed or rolled-back attempts do not consume them. Preserve numbers and records after refund or cancellation. Keep sandbox and development series separate from live purchases. Approved in project conversation; implemented locally in `20261004120000_customer_order_numbers.sql` and order displays, with remote migration/deployment pending. These are store order references, distinct from Paddle invoices. This does not establish a legal invoice numbering or personal-data retention policy.
- When drafting the agreement, verify applicable requirements and obtain appropriate legal review for the seller and sales markets. This record does not determine enforceability or replace that review.
- Future published terms should have their own version/date and an appropriate acceptance record; this internal file does not establish customer acceptance.

## Approved licensing direction — owner approval, 2026-10-02

Source: project conversation following the successful development-machine release test. The owner accepted the proposed account-level model and 30-day offline allowance, then requested this record.

| ID | Decision | Implementation status |
| --- | --- | --- |
| LIC-016 | The logged-in account owner can reveal/copy the same activation key whenever needed; mask it by default. | Approved 2026-10-03. Encrypted storage and Reveal implemented locally; migration/live verification pending. Older hash-only keys need one explicit replacement. No extra password prompt required in this milestone. |
| LIC-001 | One account activation credential per customer account, usable to activate owned QA Tools products. | Website key creation/replacement and shared activation API implemented locally; credential migration/live verification pending. Houdini integration pending. |
| LIC-002 | One active computer per account covering all owned tools. Release/reassign the account machine once, rather than separately for each tool. | Account foundation applied and website verified by owner. Shared activation API prepared locally; new migration and Houdini client integration pending. |
| LIC-003 | Keep product ownership separate: an account credential must not unlock unowned tools. | Website entitlements exist; licensing integration pending. |
| LIC-004 | Bind cached signed licenses to the machine ID. Use machine name as a readable label, not the sole security boundary. | Existing prototype has a machine-ID algorithm; no algorithm change approved or made. |
| LIC-005 | Signed local authorization remains usable for 30 days after the last successful renewal. | Approved; prototype still uses perpetual cached licenses. |
| LIC-006 | Attempt background renewal when Houdini starts, at most once per day. Normal HDA cooking verifies locally without network dependency. | Approved direction; scheduling, startup integration and tests pending. |
| LIC-007 | A failed connection must not block work while the cached license remains valid. Once the offline allowance expires, reconnection and successful renewal are needed. | Approved; precise expiry enforcement and outage handling pending. |
| LIC-008 | Release makes the old machine ineligible for renewal. It should lose authorization at its next successful status check or cached-license expiry. An offline old machine may overlap with a replacement for up to the remaining allowance, normally at most 30 days. | Account release foundation applied. Renewal/status checks and cached-license expiry integration pending. |
| LIC-009 | Show the offline-valid-until date and offer Refresh license before planned travel/offline work. | Approved direction; UI pending. |
| LIC-010 | Provide an explicit admin-controlled option for longer offline periods. | Direction accepted; eligibility, maximum duration and implementation undecided. Longer extensions also lengthen possible transfer/revocation overlap. |
| LIC-011 | Product ownership is a one-time permanent entitlement, distinct from periodically renewed local authorization. This is not a subscription billing decision. | qafit01 commercial direction established; production payment/license chain pending. |
| LIC-012 | Preserve Ed25519 signing. Version the license payload deliberately when adding expiry/account-machine semantics. | Existing prototype works; production format and migration strategy pending. |
| LIC-014 | Updating Houdini must not require a new account activation key or separate activation per Houdini version. Compatibility of an individual tool remains separate. | Explicit owner clarification, 2026-10-03. Server assignment has no Houdini-version binding; shared client/cache integration pending. |
| LIC-015 | On changing computers, one account activation action must cover all owned tools. | Explicit owner clarification, 2026-10-03. Shared server activation prepared; signed Houdini integration pending. |
| LIC-013 | Plan for licensing-service shutdown so permanent purchases are not left unusable solely because the service ends. | Requirement to design a continuity plan; no specific customer guarantee or mechanism chosen. |

### Key terminology

The customer account activation key is a private-to-the-customer credential. It is NOT the Ed25519 private signing key. The signing key stays exclusively on the trusted server; Houdini receives the public verification key and signed license data.

Changing a credential or issuing a license for another computer cannot remotely alter a disconnected computer's cached files. Offline revocation therefore has a delay. Do not promise immediate worldwide revocation or perfect anti-piracy enforcement.

A machine name can change or be duplicated. The existing prototype derives its ID from machine-related information; its stability and behavior on renaming/reinstallation must be reviewed before production without casually changing the algorithm.

### Important customer disclosures to draft later

- Permanent product entitlement with a requirement to renew local authorization periodically.
- One active computer per account for all owned tools, and the transfer/support procedure.
- Internet required for initial activation, new-product license acquisition and periodic renewal.
- Normal offline allowance and what happens at expiry, including any explicitly agreed outage policy.
- What happens after release, refund/revocation or account-credential replacement; distinguish server state from cached offline authorization.
- Visibility of expiry and a manual renewal option before extended offline work.
- Any longer-offline exceptions must state their own period and conditions.
- Do not describe the future product as unlimited permanent offline use.

## Existing business decisions from the handoff/blueprint

Sources: QATOOLS_PROJECT_OVERVIEW.md; QATOOLS_CODEX_HANDOFF_2026-10-02.md; QATOOLS_Master_Blueprint_Checkpoint_02.docx (2026-09-30). These are historical product decisions, not proof of implemented or legally reviewed terms.

| Topic | Recorded direction | Remaining qualification |
| --- | --- | --- |
| Product | QA Tools sells digital SideFX Houdini tools at qatools.studio. First defined product: qafit01, HDA for Houdini 21, remapping attributes to 0–1; €5, one-time purchase. | Do not invent details for other products. Reconfirm price/compatibility before publication. |
| Accounts | Account required for paid and free acquisition. | Complete email recovery and production email setup. |
| Ownership | Entitlements are authoritative; prevent duplicate ownership/purchases. Free acquisition skips payment but grants an entitlement. | Checkout, free acquisition backend and licensing integration pending. |
| Bundles | Owning a bundle grants its included products. Fixed bundle price; no complete-the-bundle discount in v1. | Bundle implementation and release scope pending. |
| Versions | Product ownership covers releases/older versions; maintenance under the same product is included. A genuinely new product generation may be sold separately. | Release/download implementation and exact support commitments pending. |
| Payments | Paddle is preferred as merchant of record; EUR-only is acceptable initially. QA Tools should not store payment-card details. | Provider integration, responsibilities and actual checkout disclosures unconfirmed. |
| Displayed price | Prefer the advertised price to be the final total where commerce/tax setup permits. | Tax-inclusive presentation and legal wording not settled. |
| Refunds | System must support refunded/revoked ownership. | No final refund policy, statutory-rights wording or offline revocation procedure approved. |
| Seller/markets | Blueprint envisages a Spain-based seller with worldwide sales. | Confirm actual legal entity, business details and supported markets before drafting terms. |

## Current implementation and verified milestones

- Website account, entitlement and order-reading foundations exist in Supabase.
- Admin routes verify bearer token and admin_users membership on the server.
- Admin grants create active ownership and reject existing entitlement records.
- Previously verified per-entitlement release is superseded by the applied account-machine foundation; owner verified website behavior. Legacy history is preserved. released_by records the verified admin when available.
- Owner reported successful application of the permissions cleanup and activation-release migrations.
- Owner's development-machine test showed qafit01 ownership retained, no active machine, and DEV-MACHINE-QAFIT01-001 retained as RELEASED with activation/release timestamps. The provided excerpt did not show the admin ID.
- Account password change was tested successfully by the owner. Reset-email testing encountered otp_expired and suspected email limits; resolution is deferred.
- FastAPI/Houdini licensing remains a separate prototype, not yet integrated with website entitlements. Existing signed perpetual licenses do not acquire expiry or account-level behavior merely because this policy was accepted.
- Creating the initial decision record changed no runtime behavior. The subsequent account-machine implementation is described below; its foundation migration has now been applied and owner-verified; later credential changes need their own migration and do not change signed prototype licenses.

## Open decisions before agreement drafting/public launch

1. Account identity and permitted use: individual/business/team use, credential sharing, resale/transfer and commercial-use scope.
2. Device scope: render farms, batch/headless Houdini, virtual machines, dual boot and reinstalls. Do not assume a workstation rule covers these.
3. Machine transfer: self-service versus admin-only, identity checks, any cooldown/limits, and treatment of lost/broken machines.
4. Renewal mechanics: long-running Houdini sessions, exact UTC expiry and clock handling, retries, revocation response, and behavior of an already-running render when authorization expires.
5. Extended offline authorization: maximum period, approval process, and interaction with machine transfer/refunds.
6. Service outages and shutdown: recovery approach, any exceptional license issuance, backup/key continuity and customer communication. No uptime/SLA promise approved.
7. Credential recovery/rotation and its effect on existing machine authorization.
8. License file packaging: the prepared version-2 implementation uses one account-machine file listing owned product slugs and verifies the requested tool locally. Actual installed HDA integration remains pending.
9. Refund/cancellation/withdrawal wording, digital-content delivery consent where applicable, disputes and revocation. Obtain applicable legal review; do not invent a blanket no-refunds clause.
10. Support channels, response targets, supported Houdini/OS versions, update duration and end-of-support policy.
11. Privacy: actual identifiers collected (account, machine ID/name, IP/logs if used), purposes, providers, retention, deletion and transfer arrangements. Confirm actual data flows before making disclosures.
12. Seller identity, invoicing/tax responsibilities, customer locations, liability/warranty terms and governing-law/dispute wording.
13. Terms versioning/acceptance, notice of changes and treatment of existing customers when policies change.

## Drafting workflow

1. Keep this record current as decisions are accepted and implementations are verified.
2. Resolve the open commercial choices; verify actual behavior and provider responsibilities.
3. Draft separate, consistent customer-facing agreement/terms, privacy notice, refund information and activation/offline help as needed.
4. Review for the confirmed seller and target markets before publication.
5. Publish versioned documents with the appropriate checkout/account acknowledgement flow, then retain the applicable acceptance evidence.

## Decision history

- 2026-10-02: Owner accepted one account activation credential, account-level machine allowance and periodically renewed offline authorization with the proposed 30-day standard allowance. This replaces the intended production direction of unrestricted perpetual offline caching and per-tool machine management. Historical prototype documentation remains as a record of existing code.
- 2026-10-02: Owner requested an ongoing project-local record for later user-agreement drafting. This file created; implementation remains unchanged.

## Account machine foundation — 2026-10-03

Local implementation prepared; remote migration and live smoke test pending.

- Migration: supabase/migrations/20261002220000_account_machine_activations.sql.
- New account_activations table is the current machine source, with a unique active row per user, own-row SELECT RLS and no browser writes. Service role can read and update release fields only; activation creation/renewal will be added with the trusted licensing service.
- Active legacy records sharing the same user/machine become one account assignment, using their earliest activation timestamp. Multiple distinct active machines for a user abort the entire transaction for review. No machine is silently selected.
- All license_activations rows stay unchanged as legacy per-tool history. Application roles lose legacy writes; historical active statuses are not current account authorization. No cached Houdini license is modified or revoked by this migration.
- Admin customers now have one account-machine release control. Per-tool ownership remains separate; inactive entitlements do not display an active tool assignment. Customer purchased/license displays use the same account machine.
- New secure route: /api/admin/account-activations/release. Old per-tool release route verifies admin and returns 410, preventing stale tabs from acting on overlapping IDs. Release retains ownership and records the verified admin and timestamp.
- Account credential issuance, new-machine activation/reassignment, Ed25519 payloads and 30-day renewal are NOT implemented by this step. Existing perpetual prototype licenses are unchanged.
- Verification: production build and route tests run locally. No local PostgreSQL/Docker runtime available; migration SQL and RLS have not been executed here. Read-only post-push checks: supabase/inspection/account_machines.sql (run query contents, not the file path).
- Apply with supabase db push from D:\qatools\qatools in the owner's authenticated terminal. Expected pending migration: 20261002220000_account_machine_activations.sql. Refresh /admin and /user afterward. Previously released development records remain under Legacy per-tool history; NOT ACTIVATED is expected when no active legacy assignment existed.

## Account credentials and activation flow — 2026-10-03

- Owner confirmed successful application of 20261002220000_account_machine_activations.sql and successful website checks. This supersedes the previous pending foundation status; no new live machine activation/release was reported in that check.
- Owner clarified and approved that the account key must not depend on the Houdini version, and moving computers must activate all owned tools in one action. These are explicit requirements for the shared client integration, not claims that the old prototype already implements them.
- Local implementation added: account activation key creation/replacement in License Data, authenticated key-management API, shared machine-activation API, server-only credential helpers, updated database types and migration 20261003010000_account_activation_credentials.sql. New migration and live UI verification remain pending.
- Keys use 256-bit server randomness; only SHA-256 hashes and identifying prefixes are stored. Full key shown once. Replacement invalidates the previous credential, preserves ownership/machine assignment and uses generation comparison to reject stale submissions.
- One explicit activation returns all active owned products and enforces one account machine. Same-machine retries reuse the assignment. Different machines require admin release. No Houdini-version binding. The receipt is unsigned and cannot authorize offline HDA use.
- 41 route tests and 10 isolated PostgreSQL tests passed. PostgreSQL tests execute actual migrations/privileges/RLS but not multi-connection load. Production build verification recorded separately in the turn result.
- Houdini shared client, signed payload, fresh production Ed25519 keys, renewal, offline expiry and deployment hardening remain outstanding. No claim of completed production licensing.
- Protocol, key recovery behavior, trust boundaries and integration checklist: QATOOLS_ACTIVATION_API.md. Read-only privilege audit: supabase/inspection/activation_credentials.sql.

Verification completion: production build passed. All 41 route tests and 10 isolated PostgreSQL tests passed. Actual localhost GET/POST key-management and POST activation requests without credentials returned 401 with Cache-Control: no-store. Authenticated live creation and remote migration remain pending.

## Revealable account activation keys — 2026-10-03

- Owner approved ongoing Reveal/Copy access for the logged-in owner, with masking by default. This supersedes the earlier show-once choice. No extra password prompt was selected.
- Owner reported the previous account-key step working; no separate new Supabase push output was provided. The new Reveal migration 20261003020000_reveal_activation_keys.sql remains pending.
- Account UI, owner-authenticated Reveal endpoint, AES-256-GCM server encryption helper, SQL credential writer/retrieval function, types and tests are updated. Activation still uses the credential hash and existing account-machine rules.
- Creation now returns metadata; Reveal decrypts the same stored key. Reload/login does not require another replacement. Existing hash-only rows require one explicit replacement and remain usable for activation until then. No automated customer key rotation was performed.
- Local server-only encryption configuration was generated in ignored .env.local; no value was exposed. Preserve it across deployments/backups. See QATOOLS_ACTIVATION_API.md for configuration and key-loss/rotation implications.
- 50 route/crypto/admin tests and 12 isolated PostgreSQL tests passed. Live migration and logged-in UI smoke testing remain pending; production build result is recorded in the turn completion.

Reveal verification: production build passed; 50 route/crypto/admin tests and 12 isolated PostgreSQL tests passed. The actual local Reveal endpoint returned 401 and no-store without login. Remote Reveal migration and authenticated browser verification are still pending.

## Signed offline license implementation — 2026-10-03

This status supersedes the earlier pending credential/Reveal verification: the owner reported both flows working. The agent has not independently inspected the remote migration history. Earlier prototype descriptions remain historical.

- Locally implemented version-2 Ed25519 proof: one machine assignment, credential generation, explicit active-owned product slugs and exact 30-day UTC expiry. No Houdini version or account activation key appears in the proof.
- Explicit activation authorizes all owned tools together. Renewal uses signed proof and can renew an expired proof only while its exact assignment and credential generation remain current. It never creates/reactivates a machine.
- Shared Python client prepares a cache outside Houdini version folders, attempts renewal on startup at most once per 24 hours across sessions, provides manual refresh/expiry display, and checks signatures/product access locally during cooking. Transient/unsigned network errors retain the cached proof; they do not extend its expiry.
- A fresh signed denial bound to the cached proof and request nonce blocks that cache immediately. Offline computers can retain valid cached authorization until expiry after release/revocation. The client does not silently reactivate them.
- Development signing key generated separately from the prototype and activation-key encryption, retained only in ignored server configuration. Client contains only the development public key. Fresh production keys and a deliberate rotation procedure remain required.
- Verification: production build passed; 57 route/admin/crypto tests, 12 isolated PostgreSQL tests and 14 Python tests passed. Includes a real Node-signed proof verified by the actual Python client. These do not constitute Houdini cooking or live transfer verification.
- Pending: owner applies 20261003030000_signed_license_renewal.sql, then install shared client/startup hook and update the actual HDA guard/UI with backup. Installed HDA and its prototype cache have not been modified. Test live activation, offline cooking, refresh, admin release and the second computer afterward.
- Long-running sessions/renders, clock-tampering policy, extended offline periods, HTTPS/rate limits, key rotation and shutdown behavior remain open. The current expiry check runs when the HDA guard is invoked; it does not terminate an already-running render.

Technical record and next-step checklist: QATOOLS_SIGNED_LICENSE_V2.md. This records implementation status and approved direction; it is not a published user agreement.

## Installed Houdini integration — 2026-10-03

- Owner reported the previous renewal step working; no independent remote migration-history query performed.
- Shared client/startup hook and updated qafit01 HDA are now installed in the local Houdini 22.0 QA Tools package, with a verified original HDA backup.
- Actual network inspection discovered the original Python licensing SOP was bypassed. It is now enabled; internal node wiring and parameters remain unchanged. Actual missing/expired/wrong-product proofs block SOP cooking; a valid synthetic proof allows remapping offline.
- One account activation/status button replaces the old credential inputs. Callback recooks the selected guard/tool after activation or manual refresh. Account key is not stored in HDA parameters.
- Synthetic headless tests passed on the installed asset. Real account activation, interactive UI, live renewal/release and second-machine transfer still need verification. No production activation or terms promise is implied.
- Integration details, source references, backup/hash, live-test instructions and remaining limits: QATOOLS_HOUDINI_INTEGRATION_2026-10-03.md. This supersedes earlier statements that the installed HDA is unchanged.
## License UI clarification and further checks — 2026-10-03

- Owner confirmed the installed HDA works successfully. This records owner verification of activation/UI/tool use; offline transfer and live release tests were not separately reported.
- Owner requested no displayed offline-expiry date, visible machine limit of 1 on website License Data and the HDA tab, and exact button text: qatools license key activation. Implemented on website and installed/repository HDA, with a new pre-UI-change backup.
- The exact 30-day proof duration, product/machine checks and background/manual renewal behavior remain unchanged. Hiding the date does not create unlimited offline validity or prevent the approved overlap until expiry after a machine release. After an extended offline period, reconnect/refresh is still required. Customer terms/help must not promise indefinite offline use.
- Continued verification passed actual installed-HDA primitive attribute remapping (0/1/2 to 5/7.5/10) and blocking after a genuine signed release denial in an isolated synthetic process. No real machine assignment was released or replaced.
- Website production build passed after the wording change. HDA geometry contents stayed byte-identical for this UI change.
- An attempted read-only live renewal check could not access the user's local cached proof due to filesystem PermissionError, including after an exact-file read grant. No proof/key was printed and no cache changed. Live renewal and second-computer transfer remain pending.
## Brand spelling and direct activation dialog — 2026-10-03

- Owner requires exactly qatools everywhere in user-visible branding, with no spaced/capitalized variants. Website pages, metadata, server error text and installed Houdini client messages updated; AGENTS.md now records the rule. Internal identifiers/cache directories and historical reference documents retain their technical/historical names.
- One password-style input dialog now opens directly from qatools license key activation, with activate account, refresh license and close. Current status and the one-computer limit are included in that same window. Refresh does not require entering the key; Close performs no activation or renewal. The key remains transient and is not stored on the node.
- Next root HTML declares data-scroll-behavior="smooth" to match its existing CSS and the Next.js warning guidance. Licensing policy, cached proofs, signing configuration and HDA network are unchanged.
- 19 Python checks passed (14 licensing, 5 direct-dialog behavior). Build and actual localhost HTML checks recorded in turn verification. Interactive rendering still needs a Houdini restart/reopen by the owner; headless tests mock the UI.
## Minimal activation window and next-step preparation

- Owner requested the activation window contain only title qatools license key activation, masked License key field and Activate / Refresh / Close buttons. Implemented in repository and installed Houdini client; removed the status/message text above the field. Machine-limit disclosure remains on the website License Data section and HDA tab.
- Five dialog interaction tests passed. Refresh works without entering a key, Close performs no licensing operation, and activation/errors use the same single entry window.
- Continued with a verified portable Houdini 22.0 development package and a second-computer transfer checklist (QATOOLS_SECOND_COMPUTER_TEST.md). No actual machine release/replacement/transfer performed.
- Live read-only renewal remained blocked by local cache filesystem permissions after a folder read grant and a PowerShell read attempt; cache/account state unchanged. The backend connection on the second computer is still a prerequisite for the live transfer test.
## Staging deferral and admin orders — 2026-10-03

- Owner accepted deferring actual second-computer transfer until hosted HTTPS staging, followed by explicit authorization to continue building. Real activation/renewal/transfer checks against staging remain required before public launch. Do not recommend copying private server configuration between machines as the current next step.
- Implemented a server-authorized read-only orders admin view: existing status filters, 50-row paging, recorded customer IDs/names, currency/amounts, item details and provider references. No order/payment/entitlement mutations or Paddle integration added.
- New migration 20261003040000_admin_order_read.sql grants the service role SELECT on orders/order_items only; remote application awaits the owner's CLI. Existing customer RLS and browser privileges remain unchanged.
- Production build and 10 new route/isolated PostgreSQL checks passed; live anonymous endpoint returned 401/no-store. Authenticated remote/browser checks remain pending after migration. Operational details: QATOOLS_ADMIN_ORDERS.md.
## Free-item acquisition — 2026-10-03

- Owner authorized continuing standard store implementation. Locally implemented confirmed-account acquisition of published zero-price items through a trusted route and service-only SQL function; no browser entitlement-write escalation.
- New ownership uses source=free. Active retries preserve existing ownership; revoked/refunded ownership is not restored. Mixed carts retain paid items. No payment/order/receipt creation or paid checkout was added.
- Shared owned state reloads from active entitlements after success; Houdini license refresh includes new owned tools under existing account-machine rules.
- Production build, ten acquisition checks (including the actual migration in isolated PostgreSQL and cart behavior) and 32 existing licensing checks passed. Remote migration 20261003050000_free_item_acquisition.sql and authenticated live testing remain pending. No live product data changed.
- Implementation and remaining verification: QATOOLS_FREE_ACQUISITION.md. This is an implementation record, not published contract wording.

Free acquisition follow-up: owner reported the migration push complete and a zero-price item available. Local site and anonymous acquisition authorization checked successfully (200 / 401 no-store). Authenticated acquisition remains pending; browser tool transport failed before the interactive check.

## Secure product downloads — 2026-10-03

- Owner authorized continuing standard store implementation. Locally added an owned-item DOWNLOAD action and trusted endpoint requiring active ownership, with a private qatools-downloads bucket and service-only release mappings.
- Two-minute signed attachment links can be used until expiry; revoked/refunded ownership blocks new links. This does not alter licensing policy or create a promise about indefinite offline use.
- Production build and eight route/isolated PostgreSQL checks passed; live anonymous endpoint returned 401/no-store. Migration 20261003060000_secure_product_downloads.sql, actual file upload/mapping and authenticated file-download testing remain pending. No files uploaded or product mappings invented.
- Details and dashboard setup: QATOOLS_PRODUCT_DOWNLOADS.md. Website admin release upload and public-release packaging remain future work.

## Admin file management — 2026-10-03

- Owner confirmed the targeted Houdini import-warning fix works after restart and authorized the next standard store step.
- Locally added admin item download management: ZIP upload/replacement, enable/disable, private unique object paths, server admin verification, service-only SQL writer with current-path checks. Ownership and licensing rules are unchanged.
- Production build and 18 admin/customer download checks passed. Anonymous live methods returned 401/no-store; current logged-in non-admin customer was blocked from /admin.
- Migration 20261003070000_admin_product_downloads.sql and live admin upload/toggle testing remain pending. No live commercial/file mappings changed in this step. Operational details/limits: QATOOLS_ADMIN_DOWNLOADS.md.

## Paddle sandbox preparation — 2026-10-03

- Owner confirmed the admin-key correction looks fine and authorized the next standard step. Owner registered with Paddle; sandbox/live account type remains to be confirmed.
- Locally prepared server-only sandbox configuration and raw-byte webhook-signature/body-limit helpers. Seven tests and full production build passed. No Paddle credentials configured, webhook route/checkout enabled, catalog mapped, payments processed or entitlements changed.
- Paid checkout remains disabled pending trusted transactional webhook fulfillment and sandbox end-to-end testing. Refund/tax policies are not newly decided. Setup/remaining work: QATOOLS_PADDLE_SANDBOX.md.

## Optional business billing — 2026-10-04

- Owner approved optional business/VAT details at Paddle checkout. Individual buyers are not required to provide them. Paddle collects those details and includes them on its invoice; qatools retrieves the account's invoice without duplicating VAT registration data in its own profiles.
- Owner observed VAT becoming zero and the payable amount decreasing after adding a VAT number in sandbox. The implementation must retain the website catalog price while recording the provider-confirmed amount actually paid. Refund matching must use actual paid amounts.
- Tax eligibility and calculation remain Paddle's responsibility; no promise is made that every VAT number removes VAT or that sandbox validation proves live eligibility. The coordinated VAT-total fix is local and requires migration/deployment and a real hosted sandbox invoice check. See QATOOLS_BUSINESS_TAX_TOTALS.md.

## Admin publication and composed-product policy — 2026-10-05

Approved: incomplete drafts may be saved; publication requires server-checked metadata, media, delivery and a matching verified price for paid products. Free products skip Paddle. First release date is set by the server and retained thereafter. Shared qatools.json and licensing runtime are maintained centrally, with a fixed copy included once in each prepared release.

Approved bundle/project model: a separate catalog product, price, purchase and uploaded release ZIP, with backend links to its included tools. These links are not decorative-only. Already-owned tools do not reduce the fixed bundle price. Published membership/release contents must be recorded consistently for licensing/refunds. A full bundle refund removes only access supplied by that purchase; independent purchases, another active bundle or another valid source must continue to provide access. Projects use validated ZIP uploads initially, preserving folder structure.

Implementation boundary: this admin-publication batch implements draft/editor improvements and individual-tool publication. Bundle/project commercial fulfillment, purchase-source tracking, dedicated ZIP validation and refund projection remain pending. Composition publication stays blocked until those are verified. No legal agreement or live Paddle rollout is claimed.

## Bundle ownership and delivery implementation — 2026-10-05

The approved separate-product bundle model is now implemented locally. Each purchase keeps a pinned included-tool snapshot; a private origin ledger records the access supplied by each root entitlement. The existing entitlements table remains the effective ownership projection used by downloads and account-wide signed licensing. Approved bundle refunds remove only that root's contribution. Active independent purchases, another bundle, free acquisitions or admin grants continue to supply access. Explicit revoked tool rows stay blocked. Existing entitlements are backfilled without rewriting their original fields.

Bundles use one separately uploaded ZIP containing their selected HDAs. The trusted server validates the exact tool filenames/content bounds and rebuilds the installer with the current shared qatools.json and licensing runtime once. It does not pull individual tool release files from storage. Publication requires a matching release attestation, published individual tools, a positive fixed price below the sum of the tools, and the existing metadata/media/verified-price checks. Released membership cannot be edited; create a new product for a different composition.

Projects remain blocked pending their dedicated ZIP and project-folder delivery work. Partial monetary refunds, dispute handling, repurchases and live Paddle rollout retain their previous deferred status. Development does not constitute a deployed feature or a new legal promise. Migration/deployment and owner-hosted bundle purchase/refund/install verification are still required. See QATOOLS_BUNDLE_OWNERSHIP_DELIVERY.md.


## New-tool identity decision — 2026-10-05

Owner approved prepared ZIP authoring/import. Asset Label supplies the website display name; Internal Name replaces its spaces with underscores; lowercase Internal Name supplies the immutable website/licensing slug. New Tool creation imports the ZIP before metadata editing, with title/slug read-only and server-enforced. Existing slugs, ownership and activation keys remain unchanged. The source JSON generated during preparation is identity metadata; customer installers retain the single shared qatools.json. The local importer/exporter are implemented; the complete Houdini Prepare shelf action and licensing injection/guard validation are the next milestone. See QATOOLS_PREPARED_TOOL_IDENTITY.md for limits and rollout.


## 2026-10-05: repurchase after an approved full refund

Approved: a fully refunded product returns to the unowned storefront state and may be purchased again at its current published price. Keep all previous orders and refund records. Active effective access from another purchase, bundle or grant still counts as ownership. Revoked access is not automatically restored.

Implemented locally in 20261005160000_refunded_product_repurchase.sql: cart and retained single-item checkout accept refunded entitlement rows; only a new verified provider payment restores ownership. Each payment creates its own order and order item. Old refund deliveries remain tied to their original item and cannot remove the new purchase. Bundle repurchases restore the pinned included tools; independent purchases survive bundle refunds.

Verified using actual PostgreSQL migration execution: individual and bundle repurchases, old refund replay, repeated refunds, active/revoked blocking and legacy checkout. Remote migration/deployment and owner testing remain pending. Supersedes earlier deferral of repurchase after refund only; revocation, disputes and partial monetary refund exceptions remain deferred.


## 2026-10-05: independent bundle prices

Owner supersedes the earlier mandatory discount comparison: each bundle has its own fixed positive price, with no comparison to a constituent-tool price total. Existing ownership still does not reduce that price. Publication verifies a valid positive bundle price and the existing server-verified Paddle mapping; no ownership, refunds or checkout verification rules change. Locally implemented in 20261005190000_independent_bundle_pricing.sql. Remote application pending.


## 2026-10-07: acquired products versus bundle tool access

Owner approved that Purchased products shows directly acquired products as standalone entries. Bundle-only tool access is displayed under Included tools within its bundle. Independently acquired included tools stay standalone. Filtering must use the active acquisition origin, not just the effective entitlement source, because an old refunded individual purchase may retain effective access from a current bundle. Licensing/download authorization remains based on all active effective access. Implemented locally in the grouped account read/UI batch; hosted rollout remains pending.
