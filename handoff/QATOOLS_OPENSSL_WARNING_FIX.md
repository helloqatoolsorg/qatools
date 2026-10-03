# Houdini optional legacy-provider warning — 2026-10-03

Owner reported successful download/use, with the exact OpenSSL legacy-provider warning appearing when placing qafit01. Reproduced in Houdini Python importing the shared client. The HDA module imports the shared UI/client rather than embedding another crypto implementation.

Changed client.py to filter only the exact optional OpenSSL 3 legacy-provider warning, within warnings.catch_warnings around the cryptography serialization/Ed25519 imports. This handles diagnostic noise; it does not repair the host OpenSSL legacy-provider configuration. Ed25519 does not need that provider. No environment settings, global persistent warning filters, algorithms, signatures, cache, machine assignment, credentials or HDA geometry changed. Other import warnings and later identical warnings still appear.

Repository client and installed client match. Installed backup: C:\Users\quima\Documents\houdini22.0\packages\qatools\python3.13libs\qatools_licensing\client.py.before-openssl-warning.bak. Save scene and restart Houdini for the currently loaded module to reload.

Verification: 21 Python tests passed, including two fresh-process tests for the exact import warning, unrelated/later warnings, unchanged environment and valid/tampered Ed25519 signatures. Installed-client fresh import was quiet. Actual installed-HDA synthetic offline point/primitive remapping, missing/unowned/expired license blocking and signed release blocking passed. Headless runner emitted the existing USD WindowsApps permission diagnostics; these did not prevent the HDA checks, and are separate from the addressed warning. The headless test loads qatools first, as the actual HDA does, before importing its synthetic test signer.

Rebuilt eight-entry development package and uploaded it to private storage at qafit01/dev/7ff94192c4fc38ad552de44f32ec91fc63c572cd67d57b5df6b2b866d7250e30/qatools-houdini22-dev.zip. Real signed download matched SHA-256 7ff94192c4fc38ad552de44f32ec91fc63c572cd67d57b5df6b2b866d7250e30; 22,648 bytes. Existing hosted mapping has not been changed by the agent. Owner SQL Editor update: handoff/qafit01_update_dev_download.sql. The initial setup SQL now points to the rebuilt package for future setup; existing mappings require the guarded update. Package remains localhost/Houdini22/Python3.13 development delivery, not a public release.

Primary reference: https://cryptography.io/en/46.0.7/openssl/ . The library documents that unsuccessful optional legacy-provider loading emits this warning.
