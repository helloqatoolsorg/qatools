# QATools customer package names — 2026-11-06

The customer package now has exactly these root items:

```text
QATools.json
QATools/
  otls/
  python3.13libs/qatools_licensing/
  scripts/pythonrc.py
```

`QATools.json` keeps the established internal `qatools` environment variable, whose value now points to `$HOUDINI_PACKAGE_PATH/QATools`. The JSON path entry stays `$qatools`. This is a package variable, not display branding.

## Updated together

- Website single-tool imports, installer replacements/rebuilds, bundle assembly and project releases generate the new exact casing.
- JSON validation and bundle parsing reject incorrectly cased root paths. Legacy direct tool ZIP uploads also require the new layout before storage writes.
- The development ZIP builder reads the same public JSON template and explicitly writes forward-slash ZIP paths. A verified archive replaces the previous development ZIP only after successful validation.
- Authoring defaults use the sibling `QATools` export folder. A remembered export directory named only `qatools` is displayed with canonical casing; other custom paths and icon preferences are preserved. No saved folders are moved or deleted.
- The local runtime updater targets the exact `QATools` customer folder and refuses to silently update a lowercase test folder on Windows.
- The public configuration download is `/QATools.json`. Git must record this case-only file rename; the deployment preparation script does this through a temporary filename.

No SQL migration or credential rotation is required. Product identities, HDA parameter names, `qatools-tool.json` preparation metadata, `qatools_licensing` imports, authoring installation paths, signature vendor values, cache locations and server keys are unchanged.

## Safe first installation

1. Close Houdini. Back up editable development HDAs separately.
2. Move only the old customer `qatools` folder and `qatools.json` out of your Houdini `packages` folder before copying the fresh download. Keep a backup outside `packages` until the new tool is verified. Do not remove the separate authoring utility or your development assets.
3. Download a newly imported finished tool. Extract and copy `QATools.json` and `QATools` into `packages`. Confirm their displayed casing. On Windows, copying over an existing lowercase directory may retain its old spelling; moving the old test package out first prevents that.
4. Restart Houdini. Verify placement, existing-key activation, a new eligible tool trial, purchase, download and refund. Account trials/ownership and the cached license are not reset by this rename.
5. Rebuild all bundles/projects from tools whose uploaded installers use the new package layout. Old stored downloads are not silently rewritten. Unpublish old test products while preparing replacements; no products/orders were deleted by this change.

This changes package naming, not Houdini-version support. The customer runtime remains the existing Houdini 22/Python 3.13 layout. The portable authoring utilities for 21 and 22 remain separate from customer runtime compatibility; test a 21-built HDA in a supported customer environment before claiming broader support.

## Verification

Tests inspect ZIP entry strings and the public directory listing with exact case, even on Windows. They cover mixed-case rejection, trusted runtime rebuilding, unsafe archives, duplicate paths, authentication, compare-and-swap updates, project payload preservation and unchanged source identities. Native HDA export tests and the production build must also run in normal CMD using the preparation script.
