# QATools branding — 2026-11-06

Use **QATools** as the exact display name. This supersedes the earlier lowercase-only rule.

Updated current website branding, logo accessibility labels, browser titles/metadata, account/admin/legal copy, API-facing messages, Houdini dialogs/errors, authoring shelf labels, generated portable-kit instructions, and text documentation.

## Compatibility exceptions

These are existing identifiers, not display branding, and deliberately keep their exact spelling:

- Domains, email addresses and URLs, including `qatools.org` and `hello@qatools.org`.
- Files and folders such as `qatools.json`, `qatools-tool.json`, `qatools/`, `qatools_dev/`, existing ZIP filenames and handoff filenames.
- Python imports and HDA parameters/callbacks/section names, including `qatools_licensing`, `qatools_authoring` and `_qatools_*`.
- Signed-license `vendor: "qatools"`, encryption associated data, account keys, browser events/storage keys, database/storage names and environment variables.
- Existing cache paths, Qt settings identifiers, product names/slugs, historical issued invoices and archived binary reference documents.

The name change must not reset a trial, change ownership, invalidate a key/proof, lose saved export paths or create a second package installation.

The owner subsequently approved renaming the customer root folder/configuration to `QATools/` and `QATools.json`. This supersedes only the earlier root-folder/configuration exceptions above. See [QATOOLS_PACKAGE_CASING.md](QATOOLS_PACKAGE_CASING.md) for the coordinated change and clean-install procedure; all other technical exceptions remain.

## Rollout

1. Verify the website build and native Houdini exports, then commit/push the branding batch. No database migration is required.
2. Reinstall the authoring utility and update the local customer runtime using the existing scripts. Restart Houdini. The shelf tab reads **QATools dev**; its internal shelf ID stays the same.
3. The rebuilt `houdini/dist/qatools-authoring-houdini21.zip` and `qatools-authoring-houdini22.zip` contain the new labels. Copy the matching kit to other computers and run its installer.
4. New customer downloads include the updated runtime. Re-export original editable development HDAs to update embedded dialog text, replace their installer ZIPs in admin, and rebuild dependent bundles/projects. Previously downloaded files do not change themselves.
5. Review display/sender names and email templates configured directly in Supabase/Resend and business/checkout branding configured directly in Paddle. Those hosted settings are outside this repository and have not been edited. Keep addresses and credentials unchanged; preserve the legal operator identity and historical issued records.

The actual logo image is unchanged. If an uploaded image itself contains old lettering, replace it through the existing logo uploader.

## Verification

Website branding, signing/renewal, trial bounds, prepared-ZIP import and key confidentiality are covered by the existing Node/Python checks. Native `hou` tests must run through Houdini's `hython`, not plain Python. Portable kits are rebuilt and their entry manifests checked.

Local checks: 55 Node tests, 50 pure-Python checks, TypeScript and scoped ESLint passed. Both authoring kits rebuilt successfully. The agent environment could not launch native hython (Windows DLL relocation error); its production build did not complete and was stopped. Run prepare-qatools-branding.ps1 in normal CMD for native checks and production build before staging/deployment.
