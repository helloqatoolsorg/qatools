"""Cross-language fixture: receives public verification data only, never a private key."""
import json
import sys
from qatools_licensing.client import verify_license

fixture = json.load(sys.stdin)
payload = verify_license(fixture["license"], {fixture["keyId"]: fixture["publicKey"]}, fixture["machineId"])
print(json.dumps({"products": payload["products"], "duration": payload["expiresAt"] - payload["issuedAt"]}))
