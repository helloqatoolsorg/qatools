# Self-service Houdini tool preparation — 2026-10-05

## Status

Prepared-tool identity migration 20261005150000 was applied by the owner. The authoring helper, separate local package installer and shelf action are implemented locally. The installed qafit01 HDA and account caches were not changed. No website deploy or product upload was performed. Website import rollout remains the preceding batch's scoped commit/push if not already completed.

## Install once on each authoring computer

Close Houdini, then run in CMD:

```cmd
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\qatools\qatools\houdini\authoring\install-authoring.ps1"
```

ExecutionPolicy Bypass applies only to this installer process; it does not change the computer's saved execution policy. The installer targets the Windows Documents/houdini22.0/packages folder by default. A custom Houdini preferences path can be supplied through -HoudiniPreferences.

It installs a separate qatools-authoring.json, the qatools-authoring helper directory, Python modules and shelf file. Existing helper files/config are copied to dated .backup files on reinstall. No customer's qatools package, HDA, cache, account key or source library is replaced. The helper is intentionally separate from customer download packages.

Restart Houdini. Use the shelf selection menu to show **qatools authoring**. It contains **Prepare qatools tool**. Exact shelf-menu wording can vary by Houdini desktop layout.

## For every new tool

1. Build the tool in Houdini as a SOP digital asset.
2. Set Asset Label to its readable name, for example Beautiful Noise. Set Internal Name to Beautiful_Noise. Use letters/numbers and single spaces in the label; do not use namespace/version suffixes in new tool Internal Names yet.
3. Use one clear output. Recommended: one Output SOP, index 0, one connected input, with both display and render flags on that Output SOP. Alternatively, put both flags on the same final SOP without an Output SOP. Multiple outputs and separate display/render branches are refused.
4. Save the asset definition and lock it (Match Current Definition). Your original remains the editable source for future work.
5. Select that asset node, click Prepare qatools tool, and choose a NEW ZIP filename.
6. The helper prepares a temporary copy with a License tab, a guard at its output and a stable slug in its PythonModule. It preserves existing parameters/PythonModule and Python OnCreated/OnLoaded scripts, refusing conflicting reserved names or non-Python event scripts instead of overwriting them. It verifies the saved guard is enabled and on the display/render/output path.
7. It exports exactly one licensed HDA and the automatically generated qatools-tool.json. The original selected HDA/library stays unchanged. An existing ZIP is never overwritten; use a new filename for the next version.
8. Website Admin → Products → New product → Tool: upload the prepared ZIP first. Title and slug fill automatically and remain locked. Add the media, description, categories, price and other details, then follow the publication checklist.
9. Test the actual website download/install/activation before public release. The downloadable installer supplies shared qatools.json/runtime automatically.

For later tool edits, edit and save the ORIGINAL source HDA, prepare it again with the SAME label/Internal Name, and replace its installer through the product editor using the new prepared ZIP. Do not build a second product or rename an existing licensing slug. This first helper exports source assets; it does not edit a previously prepared downloaded asset in place.

## Licensing behavior

License tab: State, E-mail, Machine, Date; License key activation; divider; Clear local license. The activation dialog retains Activate / Refresh / Close. Keys are never saved into HDA parameters. Preparing/exporting does not grant the creator ownership: before purchase/admin grant and activation, the guarded export is expected to be inactive.

One activation callback refreshes all prepared asset instances in the scene using the shared account cache. Newly placed prepared tools read that same cache automatically. Tool cooking verifies local signed ownership without network access. Valid cached ownership preserves output geometry; missing, unowned or expired proofs block the output. No Houdini version is added to the license slug or signed payload.

The current legacy qafit01 bridge is retained unchanged. Its historical raw-HDA/installer maintenance flow remains supported; this helper uses the new naming convention for new source assets. The helper does not silently convert legacy identifiers.

## Validation and limitations

Six actual Houdini tests cover implicit/explicit outputs, original-library byte preservation, inactive/wrong-product/expired blocking, valid offline geometry, fields/callbacks, account-wide recooking/clear, future node placement, existing PythonModule and Python event preservation, repeat source export, unsaved/conflicting/multiple-output rejection, and temporary-definition cleanup.

The installer was run in a dedicated test preferences folder. Its module imported and its shelf registered in Houdini. A headless hou.shelves.tools() inspection caused Houdini 22.0.459 to crash during shutdown AFTER reporting success. The identical shutdown crash occurs in a baseline process with no authoring package. Functional HDA preparation tests exit normally. GUI shelf/button confirmation remains an owner check; do not claim GUI review completed. Startup also reports an existing WindowsApps USD-library permission warning in this sandbox.

This is SOP-only authoring preparation, not anti-tamper DRM or a promise that editable HDAs cannot be modified. It does not certify an arbitrary artist's graph: test every real tool's output and parameters after preparation. Advanced/multi-output assets require a separate supported strategy.

Official API references: [HDADefinition](https://www.sidefx.com/docs/houdini/hom/hou/HDADefinition.html), [HDA library installation](https://www.sidefx.com/docs/houdini/hom/hou/hda.html).

## Repository checkpoint

```cmd
git add houdini/authoring/__init__.py houdini/authoring/prepare_tool.py houdini/authoring/install-authoring.ps1 houdini/authoring/toolbar/qatools-authoring.shelf tests/test_prepare_tool.py handoff/QATOOLS_TOOL_AUTHORING.md handoff/QATOOLS_PREPARED_TOOL_IDENTITY.md handoff/QATOOLS_FEATURE_BACKLOG.md
git commit -m "Add self-service Houdini tool preparation shelf"
git push
```

This authoring batch needs no new SQL migration. Installer use is local to the authoring computer. If the preceding website import batch is still uncommitted, complete its listed scoped staging commands first.
