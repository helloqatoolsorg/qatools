# qatools customer policy working draft

Prepared: 2026-10-08. INTERNAL DRAFT — not published, not accepted by customers and not a professional legal opinion. Do not deploy this file's unresolved placeholders as customer terms. Policy decisions and actual source take precedence over older handoff text.

## Information needed before publication

- Operator's legal name, country, business status, public business/contact address and applicable registration/tax details where required. Do not collect private identity documents in chat.
- Confirmed receiving support address and privacy contact.
- Voluntary refund eligibility: individual review or a defined window; scope/exclusions and consistency with Paddle's buyer terms. Mandatory rights must be preserved.
- Supported Houdini versions/platforms and permitted personal/commercial/studio usage. Current implementation targets Windows/Houdini 22; other compatibility is not certified.
- Retention schedule for account, order, activation, security and support data; actual hosting/database/email region and transfer safeguards from provider settings/agreements.
- Customer acceptance/version process and any applicable digital-delivery consent records. Linking a page does not itself prove consent.
- Licensing service continuity plan; no automatic perpetual-offline/shutdown guarantee has been implemented.

## Terms and license — draft foundation

### Products and purchases

qatools provides digital tools, bundles and project files for SideFX Houdini. Product pages describe the contents and supported software requirements. A customer account is required to acquire products and access their downloads.

Paid products are one-time purchases rather than recurring subscriptions. Purchases through Paddle are processed by Paddle as the reseller; Paddle's buyer terms and applicable mandatory rights govern its order/payment role. A successful payment is confirmed by the provider before access is granted. qatools does not handle raw card details in its application.

A bundle or project is a separate fixed-price product. It includes the tools identified for that purchase. Buying a bundle does not reduce its price because you already own an included tool. Access to an independently purchased tool remains separate from access supplied by a bundle or project.

### Account licensing and offline use

One account activation key covers the products the account owns. One computer may be actively assigned to the account at a time. Keep the account password and activation key private. Updating Houdini does not itself require a new account key; individual tool compatibility is a separate requirement.

Activation and periodic renewal require internet access. Updated clients can work offline with a valid signed local license for up to seven days after a successful renewal. An unsuccessful connection preserves a still-valid cached license. Reconnection and successful renewal are needed once that authorization expires. Normal tool cooking verifies locally. No expiry countdown is added to the interface by this document work.

Contact support to release an old computer before activating its replacement. The old computer becomes ineligible for renewal; an offline cached license may remain valid until a successful status check or its signed expiry. Ordinary offline testing passed; this wording is not a promise of unlimited offline use.

[Confirm permitted users/commercial use, redistribution restrictions, update/support scope and legally appropriate limitation/termination terms before final wording. No broad waiver of mandatory rights or blanket exclusion of defective-product remedies is proposed.]

### Refund consequences

A provider-approved full refund removes download and future licensing access supplied by the refunded purchase. An existing offline license may remain usable until a successful check or its expiry. Refunding a bundle or project does not remove access supplied by a separate active purchase or another valid acquisition. Order and original invoice history are retained. A fully refunded product can be purchased again.

Refund eligibility is separate from these technical consequences and remains to be finalized. Partial monetary refunds, disputes and chargebacks currently require operator review; do not describe them as fully automated.

## Refund policy — draft foundation

Contact [confirmed support address] with the account email, order reference, product name and a short description of the request. Never include a password or activation key. Payment/order support and refund requests can also be directed to Paddle through paddle.net.

[Insert owner-approved voluntary refund policy after checking alignment with Paddle's current policy. Do not promise approval by a fixed deadline or an instant bank settlement.]

This policy does not limit mandatory consumer rights. Digital-product withdrawal rights depend on applicable law and the actual delivery/consent process. Downloading alone must not be described as automatically waiving all rights. Defective or nonconforming content rights remain separate from discretionary refunds.

If a refund is approved, payment handling is performed through Paddle and the access consequences described in the license section apply. Retain original invoices/order history; do not state that refunded invoice records are erased.

## Privacy notice — factual outline awaiting final details

Controller: [legal operator and contact]. This notice covers the qatools website, account and licensing functions. Paddle publishes its own notice for its reseller/payment operations.

Data and purposes established from current implementation:

| Data | Purpose |
| --- | --- |
| Account email, user/profile name and authentication/session information | Create and protect the account, deliver confirmation/reset emails and provide purchased access. Password authentication is handled by Supabase Auth. |
| Purchased products, order/provider references, amounts/currencies and refund/access records | Fulfill purchases, provide invoices/downloads and reconcile access/refunds. |
| Machine identifier/readable label, activation history and account-linked license credential records | Enforce the approved machine assignment and issue/verify product-aware authorization. Machine name alone is not the security boundary. |
| Download-request records | Record authorized download-link requests and free/paid counts; not proof of completed transfer. |
| Network identifiers and operational/security records | Protect endpoints and diagnose failures. The licensing limiter stores keyed hashes of request subjects; provider infrastructure may process separate connection logs. |
| Support correspondence | Respond to customer requests; actual mailbox and retention to be confirmed. |

Services used: Supabase for authentication/database/file storage; Vercel for website/API hosting; Resend for authentication email via custom SMTP; Paddle for checkout/payment/invoice operations. Classify roles, locations and transfer safeguards from actual agreements/settings before final wording. Squarespace manages domain DNS; do not represent it as the application database or payment processor.

Browser storage: login sessions, cart and likes use browser storage. Admin draft recovery also uses localStorage/IndexedDB, including pending admin files. Houdini stores its signed local licensing cache on the computer. No advertising analytics integration was identified in this source review; this is not proof that no third-party checkout/provider tracking exists. Audit deployed behavior before deciding whether a consent banner is necessary.

[Specify lawful bases by processing purpose, retention periods or criteria, rights/request route, applicable supervisory authority, international-transfer safeguards and deletion exceptions. Do not claim account deletion/export automation exists or that all purchase records can be deleted immediately.]

## Support page — draft foundation

Contact: [confirmed receiving address]. Include your account email, order reference if relevant, tool name, Houdini version, operating system and steps to reproduce the issue. Do not send your password, activation key or private license files.

For installation, link /install. For machine changes, request release of the previous assignment. For billing/refunds, link Paddle buyer support as well as the qatools support address. Do not promise support response times until approved.

## Website implementation plan

Once required facts/policy are supplied:

1. Add /terms, /privacy, /refunds and /support using the existing visual language and accessible headings.
2. Reuse a consistent footer with qatools branding and policy/support links across public/account pages; replace old qatools.studio text.
3. Add clear checkout disclosures without duplicating Paddle's invoice/payment logic.
4. Decide and implement durable versioned agreement/consent evidence where needed in a focused batch. Never infer consent just from account existence or an order row.
5. Verify mobile layout, links, contact details, accurate licensing/refund wording and real checkout consent behavior before publication/live approval.

## Sources checked — 2026-10-08

- https://www.paddle.com/help/start/account-verification/what-is-domain-verification — accessible terms/refund/privacy pages and website review.
- https://www.paddle.com/legal/buyer-terms — Paddle reseller and supplier agreement roles.
- https://www.paddle.com/legal/refund-policy — Paddle refund process and eligibility framework.
- https://europa.eu/youreurope/citizens/consumers/shopping/returns/indexamp_en.htm — digital-content withdrawal exceptions require express agreement under applicable conditions.
- https://commission.europa.eu/law/law-topic/data-protection/information-individuals_en — transparency and individual rights.

EU sources are preparatory context because earlier documents envisage a Spain-based operator. Actual operator jurisdiction is still a required answer. No country-specific tax retention period or universal consumer-law promise was invented.

## Confirmed information — 2026-10-08

Owner confirmed Quim Amat Heinert, individual in Spain, hello@qatools.org, and approved case-by-case discretionary refund review for requests within 14 days, preserving statutory rights. Postal/tax disclosures explicitly remain pending. Implemented /terms, /privacy and /refunds as visible pre-launch drafts with noindex metadata; /support has the confirmed contact and installation/payment guidance. Shared policy/support footer links replace old qatools.studio labels on existing website/admin pages. No checkout acceptance or digital-delivery consent is claimed. The jurisdiction is now confirmed as Spain; prior unknown-jurisdiction notes are historical.
