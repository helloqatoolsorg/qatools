from fastapi import FastAPI
from pydantic import BaseModel

import base64
import os

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

# ======================================================
# PATHS & KEY LOADING (ONCE, CORRECTLY)
# ======================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PRIVATE_KEY_PATH = os.path.join(BASE_DIR, "keys", "private_key.pem")

with open(PRIVATE_KEY_PATH, "rb") as f:
    PRIVATE_KEY = serialization.load_pem_private_key(
        f.read(),
        password=None,
    )

# ======================================================
# CONFIG
# ======================================================

VENDOR_ID = "qatools"
LICENSE_VERSION = 1

# TEMPORARY purchase-token allowlist
VALID_PURCHASE_TOKENS = {
    "TEST-TOKEN-123",
    "QATOOLS-DEMO-001",
}

# ======================================================
# FASTAPI SETUP
# ======================================================

app = FastAPI()


class ActivateRequest(BaseModel):
    machine_id: str
    email: str
    purchase_token: str


# ======================================================
# LICENSE HELPERS
# ======================================================

def build_license_payload(machine_id: str) -> str:
    """
    Build the license payload.
    """
    return "|".join([
        VENDOR_ID,
        machine_id,
        "PERPETUAL",
        "ALL",
        str(LICENSE_VERSION),
    ])


def sign_payload(payload: str) -> str:
    """
    Sign payload with the private key.
    """
    signature = PRIVATE_KEY.sign(payload.encode())
    return base64.b64encode(signature).decode()


# ======================================================
# ROUTES
# ======================================================

@app.get("/")
def root():
    return {"status": "qatools license server running"}


@app.post("/activate")
def activate(data: ActivateRequest):
    """
    Online activation endpoint.
    """

    # 1. Validate purchase token
    if data.purchase_token not in VALID_PURCHASE_TOKENS:
        return {"error": "invalid_purchase_token"}

    # 2. Build and sign license
    payload = build_license_payload(data.machine_id)
    signature = sign_payload(payload)
    license_key = f"{payload}|{signature}"

    # 3. Return license key
    return {"license_key": license_key}
