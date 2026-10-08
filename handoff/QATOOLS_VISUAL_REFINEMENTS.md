# qatools visual refinements — 2026-10-08

Owner approved replacing the shared logo with their supplied PNG. Source asset copied unchanged to public/assets/qatools_logo.png. The taller mark is contained at 54px image height so the top shelf keeps its existing layout.

All website heart glyphs now use the same outlined shape, including when liked; existing liked classes color it red. This uses the owner's approved outlined/red fallback rather than mismatched filled glyphs. Card and product-page buttons carry explicit purchased classes: in-cart is blue; purchased is green and remains disabled. Hover removal wording/function remains available with blue styling. Ownership/cart checks are unchanged.

Customer products and likes cards no longer render category badges over the images or release dates in card information. The product count is removed from the middle of both second shelves. Dates remain stored and usable for sorting, tool-page information and admin records. Top-shelf middle links retain lighting on hover, with a 120ms entry and 420ms return, and no underline.

No SQL migration, payment, ownership, license or hosted content changes. Only the shared local logo is replaced. TypeScript/CSS/diff verification and owner normal CMD build/deployment/visual checks are required; agent sandbox has the known SWC canonical-path denial for production builds.

Rollout, one command at a time:

```bat
cd /d D:\qatools\qatools
npm run build
git add public/assets/qatools_logo.png src/app/interactions.css src/app/page.tsx src/app/liked/page.tsx src/app/product/page.tsx src/app/install/page.tsx src/app/cart/page.tsx src/app/whats-new/page.tsx src/app/user/page.tsx src/components/AdminNavigation.tsx handoff/QATOOLS_VISUAL_REFINEMENTS.md
git commit -m "Refine logo hearts and product card states"
git push
```

Stop on failure. After Vercel Ready, hard-refresh and review logo sizing on desktop/mobile, all outlined hearts and red liked state, blue cart/green purchased buttons, card spacing without badges/dates/count, hover return and reduced motion. Hosted visual checks pending.


## Cart hover and icon consistency — 2026-10-08

Removed duplicate React hover state from products and likes, plus legacy unconditional CSS hover rules. One fine-pointer CSS rule now shows the red removal label; leaving the button restores the blue IN CART label. Touch devices retain IN CART. Cart actions and ownership state are unchanged.

Added OutlineIcon as the shared thin-stroke cart/account geometry across customer and admin headers. Product cart indicators use the same cart icon. Hamburger lines are 1px, with corresponding open-state offsets corrected.

Validation: TypeScript, CSS parsing and diff whitespace checks passed. Run the production build in normal CMD before committing. After deployment, verify repeated hover/exit on products, likes and the tool page; purchased buttons remain green and disabled. No migration is required.

## Account presentation — 2026-10-08

Dashboard replaces MY qatools in the sidebar and uses a prominent button, as does Log out. The overview title is the saved user name (Dashboard fallback when absent). Details are ordered: email, active machine, license key, activation date, purchased tools.

Dashboard and License Data share one key component: a clear masked/read-only field, Reveal/Hide and Copy controls. Removed machine-limit and obsolete integration/explanatory paragraphs. Replacement stays available under Manage key with its existing confirmation; authenticated key endpoints, clipboard fallback and reveal handling are preserved. Active status is green. No database changes.

Validation: TypeScript, CSS parsing and whitespace checks passed. Run npm run build in normal CMD and check account presentation at desktop/mobile widths after deployment.


## Mobile header and logged-in account icon — 2026-10-08

Below 900px (the existing compact navigation breakpoint), the logo uses 70% of its desktop height and maximum width; the account name is hidden. Desktop name visibility remains unchanged. Shared OutlineIcon now derives signed-in account styling from AuthContext, making the account circle green on desktop/mobile and returning to its inherited neutral color after logout. No database or settings changes.


## Shared hearts, logo navigation and calmer motion — 2026-10-08

Every header/card/tool-page heart now uses the same SVG path via OutlineIcon, so mobile font fallback cannot change its shape. Liked state colors the same outline red. Existing cart/account vector geometry and authentication-driven green account state remain shared across screen sizes.

All customer logo links use Next Link so clicking the logo preserves the root branding provider instead of rebuilding it during a full document reload. On a fresh document the provider starts unresolved and BrandLogo reserves space until the saved setting is known; it no longer displays the old default logo while waiting. Settings failures retain the last valid logo, with the packaged default as initial error fallback.

Interaction timing is about one-third slower: ordinary transitions 200/300 ms, spring movement 340 ms, like feedback 480 ms, menu fade 260 ms, cart badge 460 ms and flying image 650 ms. Flying-image removal is adjusted to 700 ms so it is not cut off. Press feedback remains short; reduced-motion behavior is retained.

The framework starter favicon.ico is removed. Metadata references /api/site-icon, a public, no-store redirect to the current allowed branding/logo path (packaged PNG fallback). It reads public settings with the publishable key, never the service role. The provider also updates browser favicon links after an admin logo change. No paid hosting feature or environment-variable change is involved. No migration is required.

Validation: four branding rendering/favicon regressions plus six existing logo-upload tests passed. CSS parsing and whitespace checks passed. Run the production build in normal CMD before committing; after deployment check the heart on phone/desktop, logo clicks, hover feel and browser-tab icon.
