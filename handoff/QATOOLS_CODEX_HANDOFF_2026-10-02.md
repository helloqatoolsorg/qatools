# QA Tools — Codex Handoff

> Current approved licensing policy and future agreement source: [QATOOLS_POLICY_DECISIONS.md](QATOOLS_POLICY_DECISIONS.md). The owner accepted one account credential, one account-level machine slot and a 30-day renewable offline allowance on 2026-10-02. Account-machine foundation is applied and owner-verified. Account credentials/activation are prepared locally with a new migration pending; signed licensing and 30-day renewal remain outstanding; older descriptions below preserve historical implementation context.

Updated: 2026-10-02

Purpose: give Codex enough context to continue the existing QA Tools repository from the exact current development point without redesigning or rebuilding working systems.

---

## 1. Current Status

QA Tools is approximately midway through implementation.

The customer-facing frontend and account foundation are substantially implemented. The database foundation is in place. Real entitlement, order, activation, and admin data are now flowing through Supabase.

Most important latest milestone:

**The secure `/admin` interface can now load real Supabase Auth customers and manually grant a real product entitlement through a trusted Next.js server route. This was tested successfully.**

The latest successful test:

- admin account **B** logged into `/admin`
- customer list showed real Auth accounts
- customer details expanded correctly
- admin selected `qafit01`
- admin pressed **GRANT ENTITLEMENT**
- secure API created entitlement
- UI refreshed
- account B changed from 0 to 1 product
- entitlement appeared correctly
- expected API requests succeeded

Do not replace this architecture with client-side privileged database writes.

---

## 2. Local Repository

Current Windows project path:

`D:\qatools\qatools`

Framework/tooling:

- Next.js 16.3.8
- TypeScript
- App Router
- React
- ESLint
- React Compiler
- no Tailwind
- `src` directory
- default import alias `@/`

Development server:

`npm run dev`

Expected local URL:

`http://localhost:3000`

Before completing meaningful implementation work, run an appropriate verification such as:

`npm run build`

and report errors rather than hiding them.

---

## 3. Important Working Files

Browser Supabase client:

`src/lib/supabase.ts`

Current design:

```ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey
);
```

Server-only privileged client:

`src/lib/supabaseAdmin.ts`

It imports `server-only` and uses:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The service-role environment variable must NEVER be renamed to a `NEXT_PUBLIC_*` name or imported into a Client Component.

Existing client auth:

`src/context/AuthContext.tsx`

Shared item/application state:

`src/context/QAToolsState.tsx`

Main page:

`src/app/page.tsx`

Tool page:

`src/app/product/page.tsx`

Liked page:

`src/app/liked/page.tsx`

Customer account page:

`src/app/user/page.tsx`

Admin page:

`src/app/admin/page.tsx`

Admin customer API:

`src/app/api/admin/customers/route.ts`

Admin entitlement grant API:

`src/app/api/admin/entitlements/grant/route.ts`

---

## 4. Frontend Reference / Non-Regression Rule

**Prototype 18 is frozen and is the authoritative frontend reference.**

Do not casually redesign pages or alter established visual behavior.

The website already has working behavior for:

- dynamic product list from Supabase
- categories
- complexity
- product media
- sort
- filter
- search
- search suggestions
- keyboard search behavior
- likes
- cart
- purchased state
- cart animation
- tool page
- liked page
- cart page
- customer account page
- responsive top shelf
- compact/hamburger navigation

Responsive top shelf was specifically fixed and must not regress.

Core shared-state rule:

**One item = one shared state everywhere.**

---

## 5. Current Supabase Product Schema

### `category`

Fields include:

- id
- name
- slug
- sort_order
- active

Known rows:

- SOP
- DOP
- ROP
- Shelf Tool

### `complexity`

Fields include:

- id
- name
- slug
- sort_order
- active

Known rows:

- easy (ID 1, sort order 1)
- medium (ID 2, sort order 2)
- difficult (ID 3, sort order 3)
- advanced (ID 4, sort order 4)

Confirmed by the owner's live SQL results on 2026-10-02; all four rows are active.
No complexity database migration is needed. Earlier Simple/Complex labels were incorrect.

### `products`

Fields include:

- id
- name
- slug
- subtitle
- description
- price_eur
- category_id
- complexity_id
- compatibility
- current_version
- release_date
- published
- also_included_in_text
- timestamps

Known product slugs:

- `qafit01`
- `qavellum01`
- `qasim01`

Do not invent exact product data for qavellum01/qasim01.

### `product_media`

Fields include:

- id
- product_id
- media_type
- file_path
- external_url
- role
- sort_order
- created_at

Storage bucket:

`product-media`

---

## 6. Account / Commercial Schema

### `profiles`

Important fields:

- `user_id uuid primary key references auth.users(id) on delete cascade`
- `name`
- `invoice_details`
- timestamps

A signup trigger inserts a profile automatically.

RLS:

- user can select own profile
- user can update own profile

Authenticated users have table-level SELECT/UPDATE while RLS restricts rows.

### `orders`

Important fields:

- id
- user_id
- provider
- provider_order_id
- provider_transaction_id
- status
- currency
- subtotal
- total
- provider_created_at
- timestamps

Customer browser has read-only access to own rows.

### `order_items`

Important fields:

- id
- order_id
- product_id
- quantity
- unit_price
- created_at

Customer reads through parent order ownership.

### `entitlements`

This is the **ownership source of truth**.

Important fields:

- id
- user_id
- product_id
- order_item_id nullable
- source: purchase / free / admin
- status: active / refunded / revoked
- granted_at
- revoked_at
- timestamps

Constraint:

- unique user/product

Browser users can read their own entitlements.
Browser users must NOT self-grant entitlements.

### `license_activations`

Important fields:

- id
- entitlement_id
- user_id
- product_id
- machine_id
- status: active / released / revoked
- activated_at
- timestamps

Constraint:

- unique active activation per entitlement

Customer browser reads own activation data.
Writes are reserved for trusted backend logic.

### `admin_users`

Fields:

- `user_id uuid primary key references auth.users(id) on delete cascade`
- `created_at`

The table intentionally does NOT duplicate user email.
Email remains in `auth.users`.

Browser RLS permits an authenticated user to see only their own admin membership row.
There are no browser admin-promotion writes.

---

## 7. SQL Milestones Already Completed

The following conceptual migrations/queries have been run successfully.

### `001_account_purchase_licensing_foundation`

Created:

- profiles
- orders
- order_items
- entitlements
- license_activations
- profile signup trigger
- related RLS policies

### `002_profiles_permissions`

Granted authenticated:

- SELECT profiles
- UPDATE profiles

### `003_account_read_permissions`

Granted authenticated SELECT on:

- orders
- order_items
- entitlements
- license_activations

### `004_test_entitlement_qafit01`

Development-only manual entitlement test for account A.

Result: working.

### `005_test_order_qafit01`

Development-only real order + order item for account A.

Provider values are development placeholders.

Result: working and visible under Orders & Receipts.

### `006_test_license_activation_qafit01`

Development-only activation database record.

Example machine ID:

`DEV-MACHINE-QAFIT01-001`

Result: working and visible under License Data / Purchased Products.

This does NOT generate the Ed25519 license. It only tests database activation state.

### `007_admin_foundation_safe`

Created `admin_users`, enabled RLS, created:

`admin users can read own membership`

and added admin account B.

Result: working.

### `008_admin_service_role_read_permissions`

Granted service_role SELECT on:

- admin_users
- profiles
- entitlements
- license_activations
- products

This was needed because server-side admin customer loading initially failed with:

`permission denied for table admin_users`

Result after grant:

working.

### `009_admin_entitlement_write_permission`

Granted service_role:

- SELECT entitlements
- INSERT entitlements

The service role may display additional built-in privileges in Supabase; normal browser users were not granted those privileges.

Result:

admin entitlement grant works.

---

## 8. Test Accounts

Development currently uses:

- **A** — normal customer account
- **B** — administrator account
- one additional old/unfinished test Auth account

The unfinished account appears in admin customer listing because it exists in Supabase Auth even though onboarding/login was not completed.

Do not hard-code actual emails into source.

Admin B is represented by a matching `admin_users.user_id`.

---

## 9. Customer Account — Current Working State

The customer page is connected to real Supabase data.

### General / Personal Information

Real persistence:

- auth email
- `profiles.name`
- `profiles.invoice_details`

### Purchased Products

Reads active entitlements joined to products/category/activation data.

A purchased product can show:

- product
- ownership source
- acquired date
- machine
- license status
- View Product

### Orders & Receipts

Reads real:

- orders
- order_items
- products

Development test order for qafit01 appears correctly.

Real receipt download is still pending payment-provider integration.

### License Data

Reads existing entitlement/activation data.

Before activation:

`NOT ACTIVATED`

After test activation:

machine ID + `ACTIVE`

Again, this is database activation status, not production Ed25519 issuance yet.

### Payment Method

Provider-oriented placeholder.
QA Tools should not store card details itself.

---

## 10. Purchased State — Current Working State

`src/context/QAToolsState.tsx` loads real active entitlements for the current user.

It exposes purchased state such as:

- purchased item slugs
- purchased count
- purchased loading state
- `isPurchased(...)`

Behavior:

- logged out clears purchased state
- owned products are removed from cart
- cart toggle does nothing for purchased items
- likes/cart remain localStorage-based where appropriate
- purchased is NOT localStorage

Confirmed working across:

- main page
- tool page
- liked page

Owned item behavior includes:

- green purchased tick
- cart disabled
- label `PURCHASED`

---

## 11. Admin — Current Exact Milestone

Admin UI exists at:

`/admin`

Browser UI checks own `admin_users` membership.

Important:

**This browser check is only a UI gate. It is not relied on as privileged authorization.**

Privileged APIs independently:

1. receive Supabase bearer access token
2. call Supabase Auth to verify the token/user
3. check verified user's ID in `admin_users`
4. only then use `supabaseAdmin`

### `/api/admin/customers`

Current trusted endpoint can read:

- Supabase Auth users
- profile data
- entitlements
- license activations
- products

Admin page displays real customer accounts.

Current UI distinguishes confirmation state and can display:

- email
- name
- confirmation state
- product count
- last login
- user ID
- account created date
- profile data
- active activation count
- entitlements
- machine IDs
- activation status

### `/api/admin/entitlements/grant`

Current trusted POST action:

- verifies admin bearer token
- independently verifies `admin_users`
- verifies target Auth customer exists
- verifies product exists
- checks for an existing entitlement record
- inserts new entitlement:
  - source = `admin`
  - status = `active`
  - granted_at = current timestamp

It does NOT silently reactivate refunded/revoked entitlements.

That must remain a separate explicit future action.

Current admin UI:

- expands customer
- lists products not already represented by entitlement
- blocks grant to unconfirmed account
- allows selection of product
- `GRANT ENTITLEMENT`
- refreshes customer state after success

Latest tested result:

**works correctly.**

---

## 12. Security Boundary — Preserve This

Do NOT:

- put the service-role key in browser code
- add `NEXT_PUBLIC_` to the service-role variable
- grant browser users INSERT/UPDATE/DELETE on commercial tables just to make an admin screen easier
- query all `auth.users` directly from browser code
- allow browser self-grant of entitlements
- allow client-side admin membership alone to authorize privileged work
- put the Ed25519 private key in Next.js client code or Houdini
- commit production secrets into repository

Preferred admin structure:

Browser
→ authenticated bearer token
→ Next.js `/api/admin/...`
→ verify Supabase user
→ verify `admin_users`
→ server-only `supabaseAdmin`
→ narrowly scoped privileged action

---

## 13. Houdini Licensing System — Existing Separate Prototype

There is an existing detailed handoff document:

`QATOOLS_Licensing_Handoff.txt`

The local licensing prototype works.

Working:

- Houdini HDA license guard
- stable machine ID
- Ed25519 signed licenses
- FastAPI local activation server
- request from Houdini to local FastAPI
- signed license returned
- local license cache
- local signature verification
- HDA works after valid activation

Not production-ready yet:

- cloud deployment
- production server URL
- secure production private-key secret
- entitlement-backed ownership verification
- product-specific signed licenses
- real activation-limit policy integrated with DB
- production refund/revocation strategy
- production hardening

Current development license scope is `ALL`.

Production must become product-aware.

Private key stays server-only.
Houdini contains public key only.

Do not casually alter the stable machine-ID algorithm or crypto.

Before production, generate a NEW Ed25519 keypair.

---

## 14. Planned Production Architecture

Preferred stack:

- Next.js + TypeScript
- Supabase/PostgreSQL
- Supabase Auth
- Paddle Merchant of Record
- Supabase Storage initially
- FastAPI licensing service
- Ed25519
- Vercel for website
- Railway for licensing API
- Resend for transactional email
- custom `/admin`

The payment provider may be changed later if there is a strong reason, but the architecture should keep payment verification separate from license signing.

---

## 15. Next Logical Milestones

Continue incrementally. Do not build a giant backend in one pass.

Recommended next order from the current point:

1. Harden/refactor shared server-side admin authorization helper so customer/grant APIs do not duplicate auth logic unnecessarily.
2. Build admin entitlement review actions deliberately:
   - inspect active/revoked/refunded status
   - later explicit revoke/restore semantics
3. Build activation administration:
   - review machine activation
   - release/reset machine while retaining history
   - do not delete activation history as the normal reset mechanism
4. Connect admin Orders area to real orders.
5. Add safe product/content administration needed for no-code day-to-day operation.
6. Integrate Paddle checkout.
7. Implement Paddle webhook verification.
8. Trusted webhook creates orders/order_items and entitlements.
9. Prevent duplicate purchase of owned product end-to-end.
10. Add secure product delivery/download rules.
11. Deploy FastAPI.
12. Connect FastAPI to entitlement + activation database rules.
13. Make signed licenses product-specific.
14. Replace temporary token allowlist.
15. Add production keypair / secret handling.
16. End-to-end test:
    payment → entitlement → download → activation → signed license.
17. Add transactional emails.
18. Production deployment, domain, legal/store essentials, monitoring, backups, security review.

---

## 16. Activation Reset Semantics

This has not been fully implemented yet.

Do not delete history by default.

Likely design:

- existing active activation becomes `released` when admin resets/releases machine
- a future activation can then become active
- retain activation records for support/audit history

Before implementing production reset semantics, align with the licensing server and the commercial one-machine policy.

---

## 17. Payment / Entitlement Rules

Paddle is preferred Merchant of Record.

Final purchase truth should be created from trusted payment-provider confirmation/webhooks, not from browser success pages alone.

Expected paid flow:

Paddle payment confirmed
→ trusted backend records order
→ records order item
→ grants/updates entitlement
→ account shows purchased state

Free acquisition should similarly create a trusted entitlement but skip payment.

The browser must not manufacture ownership.

---

## 18. Important Design Tradeoff: Permanent Offline License

Current licensing design intentionally permits:

online activation once
→ signed perpetual license cached locally
→ local verification afterward

Benefit:

- reliable customer experience
- tool keeps working if server is temporarily unavailable
- low licensing-server load

Tradeoff:

- already-issued perpetual licenses cannot be instantly revoked unless some revalidation/expiry strategy is added

This needs an explicit commercial decision before launch, especially for refunds/chargebacks.

---

## 19. Product-Specific Information

### qafit01

Known:

- Houdini Digital Asset (`.hda`)
- Houdini 21
- remaps incoming attribute values into 0–1 using min/max
- €5
- one-time permanent license
- planned initial one-computer activation policy

Do not invent missing product details.

---

## 20. Interaction / Implementation Preferences

The project owner is a beginner in deploying/operating a web product but understands basic code.

When explaining manual steps:

- be explicit
- avoid assuming infrastructure knowledge
- explain why a security-sensitive step is needed
- do not ask the user to paste secret values into chat

Engineering preferences:

- solve the root cause, not workaround patches
- preserve working behavior
- avoid unnecessary refactors
- avoid premature backend overengineering
- do not jump ahead several milestones
- inspect current implementation before changing it
- report exactly what changed
- run build/tests/checks after meaningful edits
- when uncertain about existing data/schema, inspect rather than invent

---

## 21. Secrets / Environment

Known environment variable names:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Never print or commit their actual secret values.

Future secrets will likely include:

- Paddle credentials/webhook secret
- Resend secret
- FastAPI production secrets
- Ed25519 production private key

Keep all privileged values server-only.

---

## 22. Frozen Vocabulary

Use these names in product/design discussions:

- item
- main page
- main page card
- main page card icons
- main page card buttons
- tool page
- tool page icons
- tool page buttons
- top shelf
- second shelf
- cart menu
- cart page

Authentication wording shown to users:

- Log in
- Log out
- Sign up
- Forgot password

---

## 23. Important Instruction for Codex

Before changing a subsystem, inspect the existing repo implementation for that subsystem.

Do not assume this document contains every implementation detail.

This handoff describes architecture and current state; **the repository is the source of truth for exact current code**.

If repo code conflicts with this handoff:

1. identify the conflict
2. do not silently overwrite the working implementation
3. preserve working behavior unless the requested task explicitly requires a change
4. report the discrepancy


## Verification checkpoint — 2026-10-02

- Baseline schema: `supabase/migrations/20261002172027_remote_schema.sql`; owner confirmed remote migration history is marked applied.
- Database table types derived from that baseline are in `src/lib/database.types.ts`, used by both Supabase clients. Authenticated CLI generation was unavailable in the agent terminal; types were derived locally from the exported SQL.
- Account and ownership loaders capture the authenticated user ID before asynchronous queries.
- Admin grants validate/normalize numeric product IDs before querying or inserting.
- `npm run build` passes, including TypeScript and generation of all pages.
- Eleven isolated admin-route checks passed with mocked Supabase: authentication/admin rejection, invalid product IDs, duplicate ownership, and numeric/string valid IDs. These checks made no live database writes.
- Live browser/account regression testing was not performed in this step.
- The database privilege discrepancy noted during schema review remains unresolved; no live database permissions or data were changed.
## Password management — 2026-10-02

- General / Personal Information includes a reusable Change password form (src/components/PasswordForm.tsx).
- Normal changes verify the current password using Supabase Auth before updateUser; recovery sessions can set a new password without the old one.
- New passwords require at least 12 characters and matching confirmation; Supabase enforces its additional configured policies. Password values are never logged or written to application storage.
- Reset emails now redirect to /reset-password. PASSWORD_RECOVERY events received on older destinations redirect there too.
- If Supabase requires reauthentication, the form requests and accepts an email verification code.
- Configure Authentication > URL Configuration > Redirect URLs to include http://localhost:3000/reset-password and the equivalent deployed HTTPS URL before testing email recovery. Hosted redirect settings were not changed or verified here.
- Production build passes. Twelve isolated mocked password-flow checks passed. Live browser verified the logged-out reset-page guard; authenticated changes and email delivery remain for private user testing.
- Changed source: src/components/PasswordForm.tsx, src/app/reset-password/page.tsx, src/app/user/page.tsx, src/context/AuthContext.tsx, src/app/globals.css.

## Database permissions review — 2026-10-02

Prepared 20261002200000_remove_browser_table_management.sql to remove four extra browser-role table privileges on the ten public application tables and postgres public table defaults. Includes transaction and effective-permission assertions. inspection/permissions.sql provides the read-only live audit. Status: APPLIED, reported by the owner after successful supabase db push. Owner-supplied post-migration SQL verifies all 20 anon/authenticated table combinations have the four privileges set to false, and postgres public table defaults no longer grant them. This verification is based on supplied live results; the agent did not execute live SQL. The owner subsequently confirmed the post-change website checks work. Broader supabase_admin defaults remain unchanged and require separate review. Existing service_role grants and RLS policies are preserved. Email recovery remains deferred; owner reported browser behavior otherwise working.


## Admin activation release implementation — 2026-10-02

- All three admin routes use server-only src/lib/requireAdmin.ts, verifying the bearer token and admin_users independently per request.
- New POST /api/admin/activations/release accepts activationId, changes only an active row to released, and stores released_at plus the verified admin ID in released_by. History and entitlements are not deleted or revoked.
- Admin entitlement rows include a release confirmation and expandable activation history; successful actions immediately update the displayed row and active counts.
- Database migration 20261002210000_admin_activation_release.sql is APPLIED, confirmed by the owner. The updated customer list selects released_by. It grants server-only column updates, not browser writes.
- Build and 18 isolated admin route/helper tests pass. Unauthenticated requests to the running local admin endpoints return 401. Authenticated release and database execution remain unverified.
- This implements database support operations only. Production licensing integration and the offline revocation policy remain unfinished. The older next-milestone lists above should be read with this checkpoint.


### Live activation-release verification — 2026-10-02

The owner reported successful application of migration 20261002210000 and a successful release of development machine DEV-MACHINE-QAFIT01-001 for qafit01. Subsequent supplied UI text shows ownership ACTIVE, source ADMIN, NOT ACTIVATED, and Activation history (1) retaining the machine as RELEASED. Displayed timestamps: activated 01/10/2026 18:29:37; released 02/10/2026 20:43:53. This supersedes the earlier pending deployment/release status. The supplied history excerpt does not include released_by, so display/persistence of the admin ID has not been independently verified. No production customer activation was used for this test.

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
