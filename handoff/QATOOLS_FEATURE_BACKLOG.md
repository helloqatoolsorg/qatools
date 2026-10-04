# qatools website and Houdini feature backlog

Recorded: 2026-10-04. Source: owner's full website/Houdini list in the project conversation.
Status: requirements recorded and initially inspected; this document does not claim implementation or deployment. Preserve Prototype 18 styling and current working behavior. Owner performs routine content/media/tool uploads. Use QATOOLS_DEFERRED_ACTIONS.md for deferred launch/verification tasks; this file tracks the requested feature batches.

## Owner corrections — 2026-10-04

These corrections supersede the original requests below:
- ADMIN-04: Do not create orders for free acquisitions. Owner wants comparable free and paid download counts and delegated the measurement choice. Count successful authorized download requests, including repeat downloads, classified by acquisition source rather than current catalog price. A signed URL issuance is not proof of a completed file transfer. Implement durable server-side recording; counts are not implemented yet. For future bulk archives, count each included tool once per successful archive download request; failed requests do not increment counts.
- USER-04: Invoice work is sorted; remove structured invoice fields from the active scope. Keep the existing working Paddle invoice flow.
- WEB-03: Owner clarified only product-card tag/button text should be larger. Implemented locally as 9px to 11px on card tags; all other typography remains unchanged. This replaces the original global enlargement request.
- PRODUCT-07: Owner clarified bundles have a fixed discounted price below the sum of their tools. Already-owned tools do not reduce that price. A successful bundle purchase grants missing constituent tools while preserving existing ownership without duplication. This supersedes the earlier recommendation to charge only for remaining tools. Refund attribution, bundle versioning and fully-owned bundle purchase behavior still require design; do not revoke ownership from an independent earlier purchase when refunding a bundle. No price/ownership behavior changed yet.
- WEB-04: Product card information below the image gets a subtly lighter background and left/right inset. Add to cart stays outside this background with its existing styling and behavior. Implemented locally on main and likes pages with shared card-info styling; hosted visual verification pending.

The first batch now excludes invoice fields and free-order creation. Font scope is limited to product-card tags as clarified above. Other recorded requests remain active.

## Shared website batch implemented locally — 2026-10-04

Owner authorized batching routine confirmed work. WEB-02, WEB-03, WEB-04, CART-01 and USER-01/02/03 now have local implementation: shared authenticated profile-name link beside likes on all eight page headers; card information background/insets and 11px tags; cart menu Checkout leads to the existing cart page; default account overview with profile/email/active machine/date, active purchase-source entitlement count and existing masked key Reveal; sidebar Log out; visible paid/refunded/partially-refunded order state styling. Clicking MY qatools returns to the overview while existing menu sections and section URLs remain available. Profile save refreshes the header name. No database or payment behavior changes. Hosted desktop/mobile and authenticated visual checks remain pending; no deployment performed by agent.

Larger admin/data-model/download/licensing/finance batches remain pending and must not be described as completed by this UI batch. Owner does not require repeated confirmation for routine authorized implementation.

## Admin navigation continuation — 2026-10-05

ADMIN-01 navigation foundation and ADMIN-05 state colors implemented locally. Dashboard is the initial section, with Customers / Accounts, Orders, Payment review, Tool files and Paddle prices in a left menu. Existing authorized controls are reused; product creation and Finance are not yet implemented or shown as working sections. ADMIN-02 sorting and ADMIN-03 customer email remain pending. The shared website batch passed production build/TypeScript, new-component lint and diff checks; authenticated browser and responsive visual verification remain pending. No migration, commit, push or deployment performed by agent.

## Batch 1 — shared website and account improvements

- WEB-02: Show the logged-in user name in the top shelf next to the likes icon. Handle long names and narrow screens without breaking the shelf.
- WEB-03: Increase all website text by 1 point and button/tag text by 2 points. Button/tag increase is 2 total, not an additional 2 after the general increase. Before implementation settle whether “point” means CSS px or literal pt; current code has many explicit sizes, so changing only the root size is insufficient. Preserve layout and responsive behavior.
- CART-01: Make the cart menu Checkout action work consistently with the working cart page. Confirmed source issue: CartMenu's button has no click handler. Reuse the existing checkout path rather than add a second payment implementation. Proposed first fix: take the buyer to the cart page, where account, free/paid and provider checks already run.
- USER-01: Default user page becomes an overview with user name, email, active machine, activation key access, activation date, purchased-tool count and Log out. Keep existing menu sections. Retain masked key + owner-authenticated Reveal behavior; do not expose a raw credential automatically.
- USER-02: Log out remains visible below the left menu in every account section, including the overview; account layout must work on mobile.
- USER-03: Orders & receipts gains a visible State column, paid in green and refunded in yellow. Include necessary existing states such as partially refunded; use text as well as color. Current source has order.status but exposes it as a tooltip rather than the requested column.
- USER-04: Replace the current invoice-details textarea with structured fields for billing details. Existing Paddle invoices already collect optional business information at checkout and are retrieved from Paddle. Design this as saved billing information/prefill if supported, not duplicate invoices issued by qatools for the same Paddle sale. Fields/privacy/migration and effect on historical invoice_details require a separate coherent design; preserve existing saved data.

## Batch 2 — admin navigation and orders

- ADMIN-01: Default admin view is a useful dashboard; current main admin content can be retained initially. Introduce account-style left navigation on the same admin page: Orders, Customers/Accounts, Finance, Products and other existing operational sections where appropriate. Preserve independent server authorization for every action.
- ADMIN-02: Order list columns: Number, Customer email, State, Price, Date. Sort each column in both directions with controls styled like the products-page sort box. Sorting must work over the complete filtered dataset, not only the current page.
- ADMIN-03: Include customer email in the expanded order details as well as the list. Retrieve it through the authorized server path; do not expose other customers' emails to ordinary users.
- ADMIN-04: Include free and paid acquisitions in order history with product-style filters, including Free/Paid. Remaining categories are unspecified. Current free acquisition deliberately creates ownership without an order, so this needs a data-model decision and migration: distinguish historical free acquisitions from newly recorded free orders, preserve references, avoid inventing paid transactions/invoices or silently renumbering history.
- ADMIN-05: Apply the same State vocabulary/colors as the user page: paid green, refunded yellow, other necessary states clearly labeled.

## Batch 3 — product types and admin product creation

- PRODUCT-01: Three product types: Tool (individual tool), Bundle (group of tools), Project (bundle plus project file). Add Type filters for Tool/Bundle/Project to the public products/main page and likes page.
- PRODUCT-02: Admin Products lists published and unpublished products in nearly public-style cards, with relevant admin data and clear publication state, allowing the owner to judge how public listings will look.
- PRODUCT-03: First card is always New product. It opens a separate product creation page resembling the existing tool page; choosing it prompts Tool/Bundle/Project before editing.
- PRODUCT-04: Creation page has editable title, subtitle, description and other product fields; Add media uploads from the owner's computer; category/tag choices come from existing lookup lists. Owner requested slug equal to title: preserve exact equality for valid canonical tool identifiers; explicitly validate uniqueness and URL-safe values rather than silently inventing identifiers for invalid titles.
- PRODUCT-05: Bundles select available tools using a filter-style multi-selection list; Add commits selections and displays included tools as tags in a section separate from ordinary category tags. Project creation also needs a project-file upload.
- PRODUCT-06: Validate all mandatory fields. Accept saves an unpublished draft, shown in Admin Products for review. Publishing is a separate explicit action. Product content creation stays distinct from Paddle price setup; reuse existing setup after the draft is ready.
- PRODUCT-07: Design constituent ownership/licensing for bundles/projects before enabling purchases: overlapping owned tools, duplicate purchases, included-tool changes, refunds and project-file access must be explicit. Current entitlements remain authoritative; no client-side ownership grants. Owner's definition of bundle/project composition is recorded; detailed overlap/refund rules are unresolved.

## Batch 4 — bulk tool packaging and download

- DOWNLOAD-01: Purchased products gets selection controls and Download selection. Selected individual tools download in one ZIP; bundles and projects download separately and are excluded from this combined archive.
- DOWNLOAD-02: Archive contains one qatools.json and a qatools/ folder grouping all selected tools plus the shared licensing runtime required for normal installation. Check existing package layout before finalizing paths; do not accidentally omit the shared Python/startup files.
- DOWNLOAD-03: Explore separate admin upload of the HDA and package metadata/config so the server builds single- and multi-tool installer ZIPs consistently. One shared configuration/runtime should be generated from trusted release metadata; do not concatenate arbitrary uploaded JSON files or copy machine/account secrets into archives.
- DOWNLOAD-04: Server verifies account and active ownership for every selected item, uses enabled private releases, and rejects missing files and unsafe/duplicate archive paths. Set archive size/count/resource limits and choose generation/storage strategy before rollout. Bulk ZIP creation is feasible but not a simple combination of the current ZIP uploads.

## Batch 5 — Houdini shared activation refresh

- HOU-01: One activation on a new computer unlocks every owned qatools node in the open project. Existing shared account cache/product-aware proof already provides one account activation for all owned tools; check and fix node recooking/UI refresh where needed rather than add per-node credentials.
- HOU-02: Newly placed owned tools automatically read the existing valid shared license and fill State, E-mail, Machine, Date. Activation state is saved in the account cache, not the .hip file or HDA parameters.
- HOU-03: Inspect existing HDA callbacks and shared client integration, then test multiple nodes/tools, newly placed nodes, unowned tools and reopened projects. Network refresh can run through the existing controlled renewal/manual activation paths; ordinary node cooking must remain local for offline operation. Newly acquired ownership may require one shared refresh; define a bounded online refresh if improving this, not an API call on every cook.

## Batch 6 — finance dashboard

- FIN-01: Admin Finance shows transaction amounts, monthly revenue, total revenue and general statistics, with revenue charts selectable by week, month, 3 months, 6 months or year.
- FIN-02: Define metrics clearly: gross customer payments, refunds, net sales, tax, Paddle fees and actual payouts are different amounts. Keep sandbox separate from live and free acquisitions out of paid revenue; do not label customer gross totals as merchant profit. Agree reporting timezone/date basis and available provider data before calculating charts.

## Recommended order and first implementation batch

Start with Batch 1's shared text sizing/top-shelf identity, account overview/logout/state display and the confirmed cart button fix. Structured billing fields should follow their own data-design pass. Then establish admin navigation/orders and product composition/drafts before bulk packaging. Houdini refresh can be worked on separately once multiple actual tools are available. Finance comes after the order/acquisition model is settled.

Do not implement this entire backlog at once. Related standard changes can share one reviewed/tested rollout. Data-model changes, packaging, billing and commercial decisions need their own batches. Current payment pause and deferred hosted multi-item refund test remain in force.

## Admin order sorting/email batch — 2026-10-05

ADMIN-02 and ADMIN-03 implemented locally: Number, Customer email, State, Price and Date sort in either direction before database paging; tied values use stable ID ordering. Email is shown in the list and expanded details, current profile name remains in details. The fixed-size 50-row page and status filter remain; Free orders are not introduced. Price sorting groups currency before amount rather than inventing exchange rates. The new read_admin_orders function is executable only by service_role, verifies confirmed/unbanned admin membership itself, and returns allowlisted fields. Browser admin visibility is not authorization.

Migration 20261005090000_admin_order_sorting.sql must be applied before deploying the new route. Existing previous local UI changes can share this rollout. Eleven route/actual PostgreSQL tests passed with zero skips, scoped lint passed; production build result is recorded in the conversation. Hosted sorting/email and responsive UI verification pending. No remote migration, commit, push or deployment performed by agent.

## Product draft/catalog batch — 2026-10-05

Owner confirmed hosted account, cart-menu and admin/order behavior. Card background approved. Follow-up local CSS changes: card tags 11px to 12px, Add to cart flush against card information and full card width, header name vertically centered with icons. Background and cart state styling retained. These follow-up changes still need hosted visual review.

PRODUCT-01/02/03/04/05/06 foundations implemented locally: tool/bundle/project column (existing products default to tool); Type OR filters on main/likes; authenticated admin catalog with publication/type/search filters and permanent first New product card; separate editor with type choice, required title/slug/subtitle/description/price/compatibility/version, optional release date, active category/complexity choices, included-tool selection and tags. Accept always creates/updates an unpublished draft. Retried creation uses a request UUID; stale updates are rejected. SQL verifies confirmed/unbanned admin membership independently; no browser commercial write grants.

Artwork uploads accept PNG/JPG/WebP up to 4 MB and 20 images, first image is card artwork and later images gallery; no videos/reordering/removal yet. They use the existing public product-media bucket, so unpublished artwork is publicly accessible by URL. Upload product artwork only. Save draft before adding images. Individual-tool publication is an explicit separate action requiring card artwork and an enabled private download mapping. Existing Tool files upload and Paddle prices setup are reused; paid checkout setup follows publication. No existing products are republished, modified or uploaded by the agent. Published products are read-only in this initial editor.

Bundle/project drafts support composition and fixed discount below constituent sum. They cannot be published (database constraint) until constituent fulfillment/refund attribution and delivery are implemented. Project-file upload, editing published products, media management, complete tool-page editor/preview polish and bundle/project delivery remain next product-management work; bulk downloads and Finance are not implemented. Do not claim this foundation completes Batch 3.

Migration: 20261005100000_product_drafts.sql; apply before deploying new public queries. Creates unique slug index; migration fails rather than rewriting any duplicate legacy slugs. Scope is catalog metadata/drafts; no payment/ownership/signature changes. New route/actual PostgreSQL lifecycle checks and production build results are recorded in the conversation. Hosted admin create/edit/media/publish, filters and desktop/mobile review pending.

## Remote migration checkpoint — 2026-10-05

Owner reported successful supabase db push applying 20261005100000_product_drafts.sql. Remote schema migration is complete. Code commit/push, Vercel deployment and hosted workflow/visual verification are still pending.
