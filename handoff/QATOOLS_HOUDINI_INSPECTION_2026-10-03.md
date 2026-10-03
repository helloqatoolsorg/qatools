# Houdini licensing inspection — 2026-10-03

## Inspected sources

- Prototype server: D:\qatools\qatools\references\licensensing-prototype\server.py (directory spelling preserved).
- Installed test HDA: C:\Users\quima\Documents\houdini22.0\packages\qatools\otls\qafit01_online.hdalc.
- Package configuration: C:\Users\quima\Documents\houdini22.0\packages\qatools.json.
- Houdini utilities available under C:\Program Files\Side Effects Software\Houdini 22.0.459\bin.
- Installed HDA SHA-256 at inspection: 19e7051771f1866b2623837169a345e53ed69a701644e312d36e7390fece0f58.

## Verified findings

The server is the old FastAPI prototype. It accepts machine_id, email and purchase_token, checks only a temporary token allowlist, and signs qatools|machine_id|PERPETUAL|ALL|1 using Ed25519. It does not validate email ownership, consult Supabase entitlements, enforce machine limits, expire licenses or implement renewal. Website account activation keys are not wired to this server.

The HDA PythonModule still points to http://127.0.0.1:8000/activate. It computes the machine ID as the first 16 uppercase SHA-256 hex characters of platform.node() + platform.system() + platform.machine(). Preserve this algorithm during integration; it is independent of the Houdini version but machine-name/OS changes can change the identifier.

The module verifies vendor, format version, machine ID and Ed25519 signature. It parses scope/products but does not enforce them. New product-aware expiry semantics require a deliberately versioned payload and client verification; do not reinterpret the old perpetual/ALL format as the new license.

The cache is $qatools/qatools_license.txt. The package maps $qatools to its qatools subdirectory, currently under houdini22.0/packages. No cached license exists at C:\Users\quima\Documents\houdini22.0\packages\qatools\qatools_license.txt. This explains a blocked guard if the environment resolves as configured; live hou environment resolution and node cooking were not tested.

The embedded HDA public key matches the prototype keys/public_key.pem. A development private_key.pem is present in the prototype folder and is ignored by Git's existing *.pem rule. Its contents were not printed or copied to the HDA. No signing keys were regenerated. Fresh production signing keys remain required by project instructions.

The HDA has License Key / Activate License plus email / Purchase Token / Activate Online controls. Activate License invokes activate_from_node(), which does not exist in its current PythonModule. Activate Online invokes the existing activate_online(). The module's require_license_or_fail() raises hou.NodeError when verification fails.

## Inspection limits

Used Houdini's hotl utility to extract readable HDA sections into the chat's scratch directory. The installed HDA was not changed, installed again, recooked or saved. No license was issued and no guard was disabled.

The utility could not expand the internal node contents: -X produced an empty Contents.contents and -t reported 'Cannot convert non-commercial HDAs'. PythonModule and DialogScript were readable. Do not claim the inner SOP wiring or commercial distribution eligibility was verified by this inspection. Inspect the node network in an appropriate Houdini session before modifying the HDA. The existing .hdalc format should be preserved during testing unless an explicit format change is justified.

The copied prototype includes venv and __pycache__ directories. These are not portable source dependencies and should be excluded before version-control commits; they were not copied into any new implementation. No Git commit was created.

## Recommended next implementation

Adapt the working machine-ID and Ed25519 concepts; do not rebuild the HDA's tool behavior from scratch. Use the website's ownership/account-machine backend as the authorization source rather than retaining the prototype allowlist as a second source.

1. Define a versioned, signed account-machine payload that identifies owned products, activation and credential generation, issued time and 30-day expiry. Confirm the exact shared payload design before issuing licenses. No Houdini-version binding.
2. Add trusted signing and renewal to the existing activation backend. Renewal must require the exact active assignment/current credential generation and must never silently reactivate a released machine.
3. Implement one shared Houdini client and activation action for all owned tools, using a user-writable cache outside Houdini-version-specific folders. Keep local per-tool entitlement/signature/machine/expiry checks during cooking; no network call per cook.
4. Use an activation dialog/shared account settings rather than retaining the account credential on individual HDA node parameters that may be saved into scenes.
5. Integrate background renewal at startup (at most once per day), manual refresh and offline-valid-until display. Preserve working offline operation while a signed license remains valid.
6. Back up the installed HDA before applying changes; validate actual cooking, offline use, expiry, release and transfer to the owner's second computer. Reuse the same account key across the transfer.

The owner confirmed Reveal/Copy works in the website after the prior step. No further machine allowance changes were approved: one active computer per account remains the current policy.
