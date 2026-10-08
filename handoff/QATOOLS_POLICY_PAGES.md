# Customer policy and support pages — 2026-10-08

## Local implementation

- /terms, /privacy and /refunds are clearly labelled pre-launch drafts and use noindex metadata. /support uses the confirmed receiving address hello@qatools.org and operator Quim Amat Heinert, Spain.
- One shared SiteFooter provides Terms, Privacy, Refunds and Support links across the eight existing website/admin pages while preserving their existing footer labels. Old qatools.studio labels are removed.
- Owner-approved discretionary refund requests: within 14 days, case-by-case review, no guarantee of approval and no restriction of mandatory rights. Existing full-refund behavior, independent-tool access and order/invoice retention are described accurately.
- Support asks for safe diagnostic/order details, never passwords, activation keys or private license files. No support deadline is invented.
- No database, payment, ownership, licensing or authentication behavior changes. No acceptance/waiver record is implemented or claimed. Live payments remain disabled/unsupported.

## Pending before final policy publication/live approval

Owner explicitly deferred the public postal address and applicable tax/registration disclosures. Complete these under Spain's LSSI Article 10 before treating the terms as final. Also confirm provider roles/regions/transfers, retention rules, permitted license-use/support scope and durable version/consent process. Do not replace those unknowns with invented contractual promises. Privacy wording is visibly a draft rather than a claimed complete GDPR notice.

Authoritative context: QATOOLS_POLICY_DECISIONS.md and QATOOLS_CUSTOMER_POLICIES_DRAFT.md. Legal sources are linked in the latter; Spain disclosure source: https://www.boe.es/buscar/act.php?id=BOE-A-2002-13758 .

## Verification and rollout

Static React rendering checks verify each new page, policy draft notices/noindex, support email and all footer destinations; stylesheet parsing, TypeScript, scoped new-file lint and whitespace checks are run for this batch. These are local checks; mobile/browser review remains owner-operated after deployment. Run npm run build in normal CMD because the agent environment previously blocks SWC canonicalization. No Supabase migration is needed.

After deployment: open the four footer links on desktop/mobile, check readable text and draft notice, confirm mailto targets, and check existing cart/header controls still behave normally. These checks do not finalize missing business disclosures or enable live sales.
