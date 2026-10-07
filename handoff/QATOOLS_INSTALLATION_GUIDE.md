# Installation guide continuation — 2026-10-07

The recent localhost connection failure came from old shared files in the active Houdini packages folder, while the hosted testB archive was correct. Owner confirmed the repair and bundle install/Refresh work. Installation-page placeholders are replaced with the verified complete-package workflow to prevent HDA-only installations from missing shared configuration and Python files.

## Scope and limits

`src/app/install/page.tsx`: Windows/Houdini 22 scope; account purchase/download link; extract full ZIP; copy qatools.json and merge full qatools folder into Houdini preferences packages; retain other tools; close/restart Houdini; website License key Reveal and HDA Activate; one account activation for owned tools/bundles; Refresh after new ownership; one-machine/support release explanation; local clear does not release remote assignment; offline cached use and renewal troubleshooting. No user-facing expiry countdown or seven-day display. Footer domain corrected to qatools.org. Existing layout/top shelf/navigation behavior retained.

No licensing, payment, ownership, upload or database behavior changed. No invented tool data/support address or untested OS support. Owner product-content uploads remain owner-operated.

## Validation

Full production build and TypeScript passed. Built install HTML contains expected package path, steps and account links with no Lorem ipsum. Scoped diff check passed. Page lint reports two pre-existing root `<a>` navigation errors and one pre-existing `<img>` warning; these unchanged elements remain for a separate shared navigation/image pass, preserving existing route behavior. Do not claim lint is clean. No new test suite for static copy. Hosted visual review remains pending.

qafit01 private hosted release was read-only verified current: online domain and current config/client bytes. All four published products with mapped installers are now current per read-only inspections and owner workflow reports. Three published test placeholders still have no installer; no catalog/storage was mutated by the agent.

## Owner rollout — CMD, one line at a time

No Supabase migration is needed.

```cmd
cd /d D:\qatools\qatools
git add src/app/install/page.tsx handoff/QATOOLS_INSTALLATION_GUIDE.md handoff/QATOOLS_LICENSING_LIMITS_7DAY.md handoff/QATOOLS_DEFERRED_ACTIONS.md
git commit -m "Document complete Houdini installation and activation"
git push
```

After Vercel Ready, open https://www.qatools.org/install on desktop and mobile. Check readable package path, purchase/license links and existing top shelf. No repeat purchase/upload or license reset needed for this static page.

Remaining stability work: production key continuity, backups/restore/monitoring, wider compatibility and legacy-client retirement. Live Paddle verification and legal/support details remain separate before-launch work; Finance and Projects remain separate features.
