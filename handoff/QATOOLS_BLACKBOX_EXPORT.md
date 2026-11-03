# Black-box tool export

Prepare qatools tool now lives in the shelf tab labelled **qatools dev**. The internal shelf identifier is retained so reinstalling updates the existing shelf rather than adding another one.

The utility validates licensing in a temporary editable staging definition, then saves that staging instance with `black_box=True` and an explicit template node. Only that export is black-boxed. The original HDA library is never written; retain it for all future edits and exports. ZIP metadata and website upload layout are unchanged.

Export sequence: rename the temporary editable definition to its release identity first, instantiate that release definition, then save directly with `black_box=True` into the ZIP staging directory. The archive contains those exact bytes; no `copyToHDAFile` follows black-box saving. Owner tests report `isCompiled() == False`, which does not establish whether black-box protection exists: SideFX distinguishes compiled OTL and black-box operator states. Tests verify the loaded library path, permission-denied traversal both before and after unlocking, and refusal to add nodes to a fresh locked instance. Failure output includes the compilation flag, child names and section names for diagnosis. Owner verification now passes all six tests on Houdini 22.0.459 Indie. The earlier claim that copying caused the failures was not established.

## Naming convention

New authoring labels use letters and single spaces only: `QA Test A`. Source Internal Name and library filename must be `QA_Test_A_dev` and `QA_Test_A_dev.hdalc`. Keep sources manually under `packages/qatools_dev/otls`. The prepared Internal Name is `QA_Test_A`, the release HDA is `QA_Test_A.hdalc`, the product label is `QA Test A`, and the website slug stays `qa_test_a`. Existing product identities are not renamed.

The shelf asks for an export folder and derives `QA_Test_A.zip` automatically. It never overwrites an existing ZIP. The admin importer accepts the capitalized release filename and uses `QA_Test_A.zip` for the customer installer too. The upload ZIP contains metadata and the HDA at its root; the website builds the customer package with `qatools.json` at root and the HDA in `qatools/otls`. No extra loose HDA is installed over a development source during export. Legacy uploads remain accepted.

Naming validation: four pure Python identity/export tests and seven website import tests pass; TypeScript passes. All six real Houdini black-box/export tests passed in the owner terminal. Deploy the importer changes before uploading the new capitalized exports; no new database migration is needed.

Real Houdini tests check that source bytes remain identical, the source can still be unlocked, and every exported instance denies access to its original network before and after an unlock attempt. Existing geometry, activation, ownership/expiry and repeated-source-export tests exercise black-box exports too.

Agent validation: syntax checks and pure export tests can run. Actual hython launch is blocked by Windows Illegal System DLL Relocation in the agent environment. Owner must run:

```cmd
cd /d D:\qatools\qatools
"C:\Program Files\Side Effects Software\Houdini 22.0.459\bin\hython.exe" -m unittest discover -s tests -p test_prepare_tool.py
```

After these tests pass, install the updated shelf using:

```cmd
powershell -NoProfile -ExecutionPolicy Bypass -File houdini\authoring\install-authoring.ps1
```

Restart Houdini, enable qatools dev, and export from an original saved HDA. Keep original source HDAs separately from downloaded release libraries of the same type. Existing published ZIPs are unchanged until the owner uploads replacements. No database migration is needed. Deploy the website importer changes before uploading capitalized HDA exports.

Owner diagnostic on Houdini 22.0.459 Indie: both black_default and black_explicit_lock deny children() before and after unlocking, while isCompiled() remains false. Adding new nodes after unlocking is allowed in both clean baseline configurations. Ordinary HDAs expose original_contents after unlocking. This establishes the relevant protection criterion; the subsequent full run passed all six licensing/geometry/source-preservation tests.

The hidden license guard depends on qatools_license_revision. Account activation/clear refresh increments it before recooking each asset, invalidating cached geometry without accessing the hidden network. Exported/prepared assets are rejected before checking development naming. These behaviors passed the owner run of six tests.
