# qafit01 shared account licensing integration — 2026-10-03

## Installed state

The owner reported everything working after the renewal-migration instructions. No separate remote migration-history query was performed by the agent. The new Houdini integration is installed locally; real account activation and second-computer transfer still need owner testing.

Package: `C:\Users\quima\Documents\houdini22.0\packages\qatools`.

- `otls/qafit01_online.hdalc`: shared account module and one `qatools license key activation` button in the License tab.
- `python3.13libs/qatools_licensing/`: tested shared client, development public configuration and UI.
- `scripts/pythonrc.py`: background renewal on Houdini startup.

The existing package JSON already adds this package to HOUDINI_PATH. A fresh hython process imported the installed shared client through Houdini's package path without an extra PYTHONPATH override. Python 3.13 matches this Houdini 22.0 installation. Other releases may use a different python3.Xlibs directory; the account key and shared cached proof are independent of that directory or Houdini version.

Original HDA backup: `C:\Users\quima\Documents\houdini22.0\packages\qatools\backups\20261003-153631\qafit01_online.hdalc`.

Original SHA256: `19e7051771f1866b2623837169a345e53ed69a701644e312d36e7390fece0f58`.

Installed SHA256: `a99b6d7728f690766e8e441da89e37dc1b558071e36de21b78805efea17ff733`.

A matching integrated HDA reference lives in repository `houdini/otls/qafit01_online.hdalc`; the normal installed copy stays in Houdini Documents. The bridge source lives in `houdini/hda-bridge/qafit01_PythonModule.py`.

## Critical prototype discrepancy fixed

Actual node inspection found `python1` contains the expected license guard but was **bypassed** in the saved prototype HDA. Both point and primitive branches depend on this input guard. Merely replacing PythonModule would therefore leave cooking unrestricted.

The guard is now enabled in the saved definition. A structural manifest before and after the network update confirmed identical node types, wires and internal parameter code, with only the guard bypass flag changed. Tool remapping behavior is preserved. The earlier inspection did not inspect the network and did not detect this discrepancy.

The account callback now forces a guard recook and then the selected tool recook after the dialog, so a previous cached licensing failure does not require replacing the node. Expected cook errors stay visible on the Houdini node. Old license-key, email and purchase-token inputs were removed from the definition; the account key is entered only in the password-style dialog and never stored as a new node parameter.

## Verification

`tests/houdini_installed_hda.py` runs under hython and uses synthetic signing keys and a temporary cache in its own process. It never activates a real account, changes entitlements, writes a production license or makes network requests during cooking.

Passed on the actual installed HDA:

- Installed shared-client discovery through Houdini package paths.
- Enabled guard invokes product-specific local authorization.
- Missing proof, wrong product scope and expired proof fail actual SOP cooking.
- Valid proof cooks without network and maps input point attribute values `0, 1, 2` to `5, 7.5, 10` with Min=5/Max=10.
- Old credential input parameters are absent.
- Actual activation button callback opens the shared action (dialog mocked in the headless test) and recooks successfully after replacing an expired test proof with a valid one.

The headless runtime emitted USD startup errors for sandbox access to WindowsApps and an OpenSSL legacy-provider warning. Ed25519 verification and all SOP assertions passed. These warnings do not establish any issue with the user's normal Houdini UI. USD and interactive dialog rendering were not tested here.

The prior website/client test milestone remains 83 passing tests and a successful Next production build. This integration changes no website routes or SQL. No new database migration is required for this HDA step.

## Owner's live check

1. Keep the website running with `npm run dev` at port 3000.
2. Save any current Houdini scene, then restart Houdini so the shared client/startup hook and updated HDA load. Use a fresh qafit01 node for the first test; old scenes can retain unlocked/embedded older definitions.
3. Copy the existing account key privately from website License Data using Reveal/Copy.
4. Open the HDA's License tab, click `qatools license key activation`, choose `Activate account` and paste the key in the dialog.
5. Confirm activation succeeds and qafit01 cooks. The offline-expiry date is internal and is no longer displayed. Reopen the same button to inspect status or manually refresh.
6. Close the website server temporarily and recook the tool: a valid cached proof should continue working. Restart the server afterward.

If another computer is currently assigned, the admin must release that account machine before explicit activation here. Use the existing account key; a replacement is not part of this test. The old FastAPI server is not needed.

Current client URL is development localhost. On the second computer, the client needs access to a website server with the same trusted signing configuration; do not assume localhost reaches the first computer. Plan that connection before transfer testing. Production needs HTTPS and production signing keys.

## Rollback

Close Houdini and copy the original backup over the installed HDA. The shared Python files/startup hook are separate additions and can be removed if reverting the entire integration. Do not delete account credentials, ownership or machine history as a rollback shortcut. Backups should remain outside the active otls directory.

## Still pending

Real account activation, interactive dialog display, live offline recooking, background renewal against the live website, signed release response and the second-computer transfer. Primitive/vector attribute regression checks, render/headless policy, continuous expiry checks in long-running sessions, key rotation and production deployment remain separate work. This is development integration, not a public-launch claim.


## Latest verification/UI update

Owner confirmed successful live use. Both the website License Data section and HDA tab now state the one-active-computer limit. Dialogs no longer display the expiry date; internal 30-day checks and manual refresh remain. New pre-UI backup: packages/qatools/backups/20261003-155233-ui/qafit01_online.hdalc.

The installed-HDA tests additionally passed primitive-attribute remapping and signed-release denial blocking, using temporary synthetic proofs only. Website production build passed. Read-only live renewal could not access the local cache under this chat's filesystem restrictions; it did not change cache or account state. Live offline/network renewal and the second-computer test remain pending.


## Direct license-key dialog

The activation button now immediately opens the masked key field with activate account, refresh license and close; there is no preceding status window. Status and the one-computer limit appear in that dialog. All visible brand text uses qatools. Refresh needs no key entry. Installed shared Python files are updated; restart Houdini to reload them. No account key replacement or SQL migration is needed.


## Latest minimal dialog

The owner superseded the previous status/message layout. The window now has only title qatools license key activation, masked License key field and Activate / Refresh / Close. Machine limit remains visible on the HDA tab and website. Five interaction checks passed. Restart Houdini to reload the installed shared module. Next-step package and backend/transfer prerequisites are recorded in QATOOLS_SECOND_COMPUTER_TEST.md.
