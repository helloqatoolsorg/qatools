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
