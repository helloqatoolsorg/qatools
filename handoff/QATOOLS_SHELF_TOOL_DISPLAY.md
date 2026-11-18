# Shelf Tool display distinction

Prepared locally on 2026-11-18. No hosted migration or deployment performed.

- Visible choices are Tool, Shelf Tool, Bundle and Project.
- Both HDA and shelf products retain `products.product_type = 'tool'`. Prices, trial scope, ownership, licensing, downloads and bundle/project membership use their existing paths.
- The source of truth is validated `prepared_identity.schema`: 1 for HDA, 2 for Shelf Tool. No extra editable type column or lookup table is introduced.
- Cards, filters, product pages, admin and account labels share `productKind.ts`. `?type=tool` selects HDAs, `?type=shelf_tool` selects shelves. Repeated query parameters combine these choices.
- The account RPC adds a derived `tool_kind` value to its existing private product objects. Authentication and permissions are retained.
- The installation guide adds Shelf Tool instructions: enable the shelf named after the tool, then Shift-click it for licensing. Installation files and account keys stay the same.

Apply `20261118120000_shelf_tool_display_kind.sql` before publishing this batch. The earlier local badge migration `20261118110000_product_release_badges.sql` is also pending and will be included by `supabase db push`.

No authoring-kit rebuild is needed for this website distinction. Existing prepared shelf ZIPs already include schema 2 metadata.

Verification: 58 relevant tests passed, including isolated PostgreSQL account privacy, source metadata, admin upload, URL filters, Shelf Tool installation instructions, bundle/refund ownership and download access. TypeScript and scoped lint passed. An isolated production-build attempt was blocked by an EPERM directory-creation error in the local execution environment, so the full build still needs to run from the owner's CMD before deployment.
