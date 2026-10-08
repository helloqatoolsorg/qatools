# Published product content editing

Implemented locally: 2026-10-08. Apply migration 20261008120000_published_product_content.sql before deploying the route/editor. Owner performs deployment and hosted review.

Published products can edit subtitle, description, category, complexity and images. Click Update product to apply the pending changes. Leaving the editor without updating discards pending changes. Existing unpublished draft recovery is unchanged.

Title, slug, type, version, compatibility, release date and included-tool membership remain protected in this editor. Existing separate Paddle price and installer workflows remain available; this update does not change payments, ownership, refunds or licensing.

The server independently authorizes admins. The database checks confirmed/unbanned membership and publication state, locks the product and verifies the exact saved version. A stale editor receives a conflict and must reload. Only four approved content fields are accepted. Nonempty subtitle/description and valid category/complexity are required; existing inactive tags can be retained but new inactive tags cannot be selected.

Images upload to unique staged Storage paths first. Product text and image references are then applied in one database transaction. A rejected image update rolls back text too. Staged objects may remain unreferenced after a failure; existing retention/cleanup policy is unchanged.

Validation: route authorization/field allowlist/error privacy; client single explicit commit; actual PostgreSQL transaction, rollback, stale conflicts, tag validation, protected commercial columns and browser-role privilege checks; existing artwork regressions. TypeScript and scoped lint checks run separately. Production build must run in the owner's normal CMD because the agent environment previously blocks Next.js SWC filesystem canonicalization.

Hosted check after deployment:
1. Edit a published product's subtitle, description and tags. Navigate away without updating and confirm the public product remains unchanged.
2. Edit those fields plus the card/gallery images, click Update product, then check the public card/tool page.
3. Open the same product in two tabs. Update the first, then try updating the second. Expect a conflict; reload to get the new saved version.
