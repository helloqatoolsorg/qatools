# Website logo administration — 2026-10-08

Admin Dashboard now includes Website logo: current/pending preview, Choose logo, Update logo, Discard preview and Restore default. Choosing a file does not publish it. Restore asks for confirmation. PNG and WebP up to 2 MB are supported; transparent PNG is recommended. SVG is not supported in this initial implementation.

Server validates admin authorization for every operation, bounds streamed upload size, decodes the actual raster image, rejects animations or dimensions over 4096, and re-encodes to PNG with a maximum 1024-pixel dimension. Sharp 0.35.5 is now an explicit dependency (already installed through Next.js). Unique immutable upload paths avoid stale image caches.

The singleton site_branding table contains only a public logo pointer and revision. Anonymous/authenticated visitors can read but cannot write, delete or manage the table. The server updates by expected revision: competing admin edits return a reload message. Upload/save failures do not overwrite the previous pointer. Unreferenced/older logo objects are retained; no automatic cleanup deletes backups.

Shared SiteBrandingProvider and BrandLogo cover all current website headers, including admin and product-not-found. Successful updates refresh this tab. Other tabs pick up changes on page load or window focus. Requests/image failures fall back to the packaged default logo. The fixed header logo constraints remain in place. Logo uploads are stored in product-media under branding/logos and are included in existing product-media storage backups; the pointer is in the database backup.

## Initial rollout

Run checks/build from D:\qatools\qatools in normal CMD. Apply 20261008110000_site_logo.sql with supabase db push, then commit/push the implementation. No changes to secrets or Vercel environment variables are needed. Once Vercel is Ready, open Admin > Dashboard > Website logo.

## Verification

- Six route/image tests passed (real Sharp decode/re-encode and PNG/WebP inputs).
- One actual PostgreSQL test passed through PGlite: public read, browser write/management denial, path constraints and revision comparisons.
- TypeScript, scoped lint, CSS and whitespace checks run for this batch.
- Agent production build blocked before compilation by Windows sandbox canonicalization Access denied; owner must run npm run build in normal CMD before pushing.
- Hosted upload/restore and visual checks remain for the owner after deployment: preview does not update header, Update does, navigating customer/admin pages keeps the same logo, Restore returns the original, and different aspect ratios do not increase header height.


### Follow-up: navigation and browser icon

The managed logo also supplies the browser-tab favicon through /api/site-icon and branding-provider updates. Removed the starter Next favicon. The logo link now navigates without rebuilding branding state; a fresh page reserves logo space until settings resolve, preventing an obsolete-logo flash. Favicon changes can require a refresh in browsers that retain tab icons.


### Proportional square favicon

/api/site-icon now returns a generated 64 × 64 PNG instead of redirecting to a rectangular logo. Sharp uses a centred cover crop: scales both dimensions equally and crops excess edges, preserving the logo geometry. The packaged default uses the same transformation and is explicitly included in the route's deployment trace. Active logo fetches have a 5-second timeout and 8 MB streamed limit; errors fall back to the packaged icon. The provider refreshes the generated endpoint with a logo-specific version query and declares 64x64 sizes. Website header rendering remains unchanged.

Regression check: a square shape in a wide source remains square in the output, catching stretching. Four branding-display tests passed, including settings/storage outages and fallback rendering. No migration required.
