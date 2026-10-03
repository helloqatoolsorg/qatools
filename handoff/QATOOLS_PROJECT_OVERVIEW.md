# QA Tools — Project Overview

> Current approved licensing policy and future agreement source: [QATOOLS_POLICY_DECISIONS.md](QATOOLS_POLICY_DECISIONS.md). The owner accepted one account credential, one account-level machine slot and a 30-day renewable offline allowance on 2026-10-02. Account-machine foundation is applied and owner-verified. Account credentials/activation are prepared locally with a new migration pending; signed licensing and 30-day renewal remain outstanding; older descriptions below preserve historical implementation context.

Updated: 2026-10-02

## What QA Tools Is

QA Tools (`qatools.studio`) is a commercial website and marketplace for digital tools for SideFX Houdini.

The store is designed around individually sold Houdini tools, with the possibility of bundles later. Each product has its own product identity, product page, price, ownership state, download/access state, and license state.

The first defined commercial product is:

- **qafit01**
- Houdini Digital Asset (`.hda`)
- Houdini 21
- Remaps incoming attribute values to the 0–1 range using min/max
- Price: €5
- One-time purchase
- Permanent license
- Initial commercial policy: one computer per license, with administrator-controlled machine reset/release

Other products already exist in the website database, including `qavellum01` and `qasim01`. Their exact commercial/product data must not be invented if it is not already present in the database.

## Business Goal

QA Tools should operate as a real commercial product business, not as a manually maintained prototype.

The intended customer flow is:

1. Customer browses products.
2. Customer creates/logs into a QA Tools account.
3. Customer purchases or acquires a product.
4. The payment/provider backend confirms ownership.
5. QA Tools creates an entitlement for that customer and product.
6. The product immediately appears as purchased everywhere in the website.
7. The customer can download/access the purchased product.
8. The customer activates the Houdini tool on an allowed computer.
9. The licensing service verifies ownership and activation rules.
10. The licensing service returns a machine-bound Ed25519-signed license.
11. Houdini caches and verifies the signed license locally.

Normal purchases and activations should require **no developer intervention**.

## Core Operating Requirement

**Day-to-day operation of QA Tools must not require programming.**

The owner should eventually be able to use the `/admin` area to perform normal operational tasks such as:

- customer lookup
- entitlement review/granting
- activation review and machine release/reset
- order review
- product management
- product media management
- product publishing
- What's New/content management
- other normal store administration

## Product / Ownership Model

A product listed in the store is called an **item**.

One item has one shared state everywhere.

If an item becomes liked, added to cart, purchased, activated, or otherwise changes state, every representation of that item should reflect the same state.

Important ownership principle:

**The `entitlements` table is the source of truth for product ownership.**

Purchased state must not be stored in `localStorage`.

Likes and cart state may remain local/browser state where appropriate, but ownership is server/database-backed.

A customer should not be able to buy an item they already own.

Free products should use the same account/acquisition/entitlement/licensing flow as paid products, except there is no payment/card step.

## User-Facing Vocabulary

Use these terms consistently:

- **item** — a tool listed in QA Tools
- **main page** — page where all items are listed
- **main page card** — representation of an item on the main page
- **main page card icons** — purchased, cart, liked icons
- **main page card buttons** — category/complexity tags and `ADD TO CART`
- **tool page** — individual tool/product page
- **tool page icons** — purchased, cart, liked icons
- **tool page buttons** — tags and `ADD TO CART`
- **top shelf** — main navigation shelf
- **second shelf** — sort/filter/product-count/search shelf
- **cart menu** — cart menu available across pages, visually sliding in from the right
- **cart page** — dedicated cart page accessed from the cart menu

User-facing authentication language is:

- **Log in**
- **Log out**
- **Sign up**
- **Forgot password**

Do not use visible “sign in/sign out” terminology.

## Frontend Design Reference

**Prototype 18 is the frozen frontend design checkpoint and reference.**

Do not redesign or casually alter the established visual language.

The responsive top shelf behavior has already been fixed and should not regress:

- logo and right-side icons retain the established design
- middle navigation becomes a centered hamburger below approximately 900px
- the core header remains a three-column layout
- compact navigation should only replace/hide the middle navigation

## Customer Account

The customer account area includes:

- Purchased Products
- License Data
- Orders & Receipts
- Payment Method
- General / Personal Information

Current account data is connected to real Supabase data for:

- profile name
- invoice details
- entitlements / purchased products
- orders
- license activation records

Payment card details should not be stored by QA Tools. The payment provider should handle those.

## Commercial Architecture

Current architecture:

- **Frontend / website:** Next.js + TypeScript
- **Database:** Supabase / PostgreSQL
- **Authentication:** Supabase Auth
- **Payments:** Paddle preferred as Merchant of Record
- **Storage:** Supabase Storage initially
- **License service:** FastAPI
- **License cryptography:** Ed25519
- **Website hosting:** Vercel
- **License API hosting:** Railway planned
- **Transactional email:** Resend planned
- **Operations:** custom `/admin` interface

The payment system, entitlement system, activation system, and cryptographic license-signing system should remain separated enough that one provider can be changed without rewriting unrelated layers.

## Licensing Philosophy

QA Tools uses a licensing security boundary rather than aggressive DRM.

Current working local licensing design:

- stable machine ID
- Ed25519 signatures
- private key only on the trusted server
- public key embedded in the Houdini client/HDA
- online activation
- signed license cached locally
- local verification after activation
- no network request every time an HDA cooks

The current development license product scope `ALL` is temporary. Production must become product-aware.

A new production Ed25519 key pair must be generated before launch because development private-key material has been exposed during development/debugging.

Do not casually change:

- the stable machine-ID algorithm
- license payload format
- keypair behavior
- signature verification behavior

Changes to these can invalidate previously issued licenses.

## Security Principles

- Never expose the Supabase service-role key to browser code.
- Never expose the Ed25519 private key to the website frontend or Houdini client.
- Browser users must not be able to self-grant entitlements.
- Browser users must not be able to create commercial orders directly.
- Browser users must not be able to create/reset activation records through direct database grants.
- Privileged admin actions must go through trusted server-side APIs.
- Admin membership is stored separately in `admin_users`.
- The server must independently verify admin membership for every privileged operation.
- Authentication/UI visibility alone is not authorization.

## Launch Definition

QA Tools is launch-ready only when the complete production chain works safely:

Customer pays
→ Paddle confirms the transaction
→ QA Tools creates the real order/order items
→ QA Tools grants the correct entitlement
→ purchased state updates everywhere
→ secure product download/access works
→ Houdini activation reaches the production FastAPI service
→ FastAPI verifies ownership and activation rules
→ a product-specific machine-bound signed license is issued
→ the HDA verifies and uses it
→ admin can support normal customer operations without code


## Complexity decision — 2026-10-02

Required levels: **Easy, Medium, Difficult, Advanced**, in that order.
The owner confirmed the existing database rows on 2026-10-02: easy, medium, difficult, advanced, with IDs and sort orders 1–4; all active.
No renaming or database migration is needed. Frontend sorting matches these rows.
Earlier Simple/Complex labels were documentation errors. This supersedes the older complexity lists in the checkpoint and handoff.

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
