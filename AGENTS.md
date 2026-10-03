<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


# QA Tools Project Instructions

## Project

QA Tools (`qatools.studio`) is a commercial SideFX Houdini tools marketplace/store.

The repository already contains working frontend, account, Supabase ownership, and admin foundations. Preserve existing behavior and visual design unless the task explicitly calls for a change.

For detailed context, read:

- `handoff/QATOOLS_PROJECT_OVERVIEW.md`
- `handoff/QATOOLS_CODEX_HANDOFF_2026-10-02.md`
- `handoff/QATOOLS_Licensing_Handoff.txt`
- `handoff/QATOOLS_Master_Blueprint_Checkpoint_02.docx`
- `handoff/QATOOLS_POLICY_DECISIONS.md`
- `handoff/QATOOLS_ACTIVATION_API.md`

Before making substantial changes, inspect the relevant current source files in the repository.

The repository is the source of truth for exact code.

---

## Core Rules

- Fix root causes rather than layering workaround patches.
- Preserve existing working behavior.
- Avoid broad refactors unless required.
- Do not invent missing product data.
- Do not redesign the established Prototype 18 visual language.
- Do not regress responsive top-shelf behavior.
- One item has one shared state everywhere.
- Work incrementally.
- Do not attempt all remaining launch work in a single change.

---

## Security

Never expose or commit secrets.

In particular:

- `SUPABASE_SERVICE_ROLE_KEY` is server-only.
- Never rename a service-role secret with a `NEXT_PUBLIC_` prefix.
- Never import `supabaseAdmin` into Client Components.
- Never put the Ed25519 private key in browser or Houdini client code.
- Do not give normal authenticated browser users privileged INSERT/UPDATE/DELETE access to commercial tables as a shortcut.
- Browser users must not self-grant entitlements.
- Browser UI admin checks are not authorization.
- Every privileged `/api/admin/...` action must independently verify the authenticated Supabase user and `admin_users` membership before using privileged access.
- Payment success in the browser is never sufficient proof of purchase.
- Trusted payment-provider confirmation/webhooks must create commercial ownership.

---

## Ownership

`entitlements` is the ownership source of truth.

Purchased state is server/database-backed, never `localStorage`.

Do not allow duplicate ownership/purchase flows for already-owned products.

---

## Admin

Current admin route:

`/admin`

Current secure routes include:

- `/api/admin/customers`
- `/api/admin/entitlements/grant`

Continue using trusted Next.js server routes for privileged operations.

Do not query all Supabase Auth users directly from browser code.

---

## Licensing

Current Houdini licensing uses:

- stable machine ID
- Ed25519
- server private key
- client public key
- cached signed license
- local verification

Do not casually change:

- machine-ID algorithm
- crypto/signature algorithm
- license payload structure

Production must move from development product scope `ALL` to product-aware licenses.

A new production Ed25519 key pair is required before public launch.

---

## UI Vocabulary

Use these terms:

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

Visible auth language:

- Log in
- Log out
- Sign up
- Forgot password

Do not introduce “sign in/sign out” in user-facing copy.

---

## Working Style

The project owner is a beginner at deployment/operations.

When completing a task:

1. Inspect the relevant current files.
2. Read the relevant Next.js guide in `node_modules/next/dist/docs/` when touching Next.js APIs or conventions.
3. Make the smallest coherent change that solves the requested problem.
4. Run an appropriate build/test/check.
5. Report changed files.
6. Report what was tested.
7. Report any unresolved issue clearly.

Do not ask the user to paste secret credentials into prompts.

---

## Current Next Milestone Direction

Continue incrementally from the working admin-entitlement milestone.

Near-term work should focus on:

- reusable server-side admin authorization
- entitlement administration
- activation release/reset with history retained
- orders admin
- no-code operational admin
- Paddle payment/webhook integration
- production licensing integration

Do not attempt all remaining launch work in one change.
## Policy decision record

Keep `handoff/QATOOLS_POLICY_DECISIONS.md` current when the owner approves material commercial/licensing rules. Separate approved policy, implemented behavior and open decisions. The 2026-10-02 account-level/30-day renewal decision supersedes older production licensing directions; it does not describe the current prototype. Do not convert proposals into legal promises.

## Brand spelling

Use exactly `qatools` in all user-visible website and Houdini text, including titles, dialogs, metadata and errors. Do not use spaced or capitalized variants. Preserve internal identifiers, protocol strings, cache paths and historical source documents unless changes are separately required.
