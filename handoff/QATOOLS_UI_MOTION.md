# qatools interface motion — 2026-10-07

Implemented locally; owner build/deployment and hosted visual review pending.

Shared `interactions.css` defines 3px control corners and 4px surface corners, 140ms press/hover and 180–260ms entry/feedback timing. Customer/admin controls, tags, input fields, cards and menus share the styling. Card image/info/cart-button seams remain joined; card buttons still touch the cards. Product imagery zooms subtly only for fine-pointer hover. Dropdowns, account sections, selected likes, real cart selections and status messages receive brief feedback. Existing card/action dimensions and commercial states are preserved. Keyboard focus outlines remain visible.

A shared CartCountFeedback component pulses badges when the actual cart count increases and cancels animations on cleanup. The product page uses the same existing cart flyer as product/liked grids, avoiding duplicate implementations. The shared flyer now skips animation for reduced-motion users. Reduced-motion CSS disables new and older transitions/animations and smooth scrolling. No payment-success animation is fabricated: existing status text and local cart states remain authoritative.

No SQL migration, secret, payment, entitlement, license or hosted data change is involved. Paddle-hosted checkout styling remains managed through Paddle separately.

Verification: TypeScript, lint of layout/shared animation/new cart feedback, CSS parsing, a reduced-motion DOM-skip check and whitespace diff checks passed. UserMenu retains its pre-existing react-hooks/set-state-in-effect lint finding in the authentication effect; this batch adds only a styling class to that component. Production build is blocked before compiling application code by SWC Windows canonical-path access denial in the sandbox. Run normal CMD `npm run build` before committing. Hosted visual review has not been performed.

Rollout, one command at a time, stop on any error:

```bat
cd /d D:\qatools\qatools
npm run build
git add src/app/interactions.css src/app/layout.tsx src/lib/cartAnimation.ts src/app/product/page.tsx src/components/CartCountFeedback.tsx src/components/UserMenu.tsx handoff/QATOOLS_UI_MOTION.md
git commit -m "Add subtle interface motion and rounded corners"
git push
```

After Vercel Ready check customer products/likes/product/account and admin products/editor: hover, press, likes, cart addition/count, filters, login menu, cart drawer, section switching, keyboard focus. Check mobile menus and enable reduced animation in OS settings: layout and actions must work without decorative movement. Visual tuning remains an owner review step.
