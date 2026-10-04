import base64
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from qatools_licensing.client import (Client, LicenseError, TemporaryError, OFFLINE_SECONDS,
    get_machine_id, license_digest, verify_license, http_request)

MACHINE = "0123456789ABCDEF"
GENERATION = "00000000-0000-4000-8000-000000000001"
KEY = "QA_" + "a" * 43  # synthetic fixture only


class LicensingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.signer = Ed25519PrivateKey.generate()
        public = self.signer.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode()
        self.keys = {"test-v2": public}
        self.now = 1791000000
        self.calls = []
        self.handler = lambda endpoint, body, key: (200, {"license": self.license()})
        self.client = Client(self.temp.name, self.keys, "http://127.0.0.1:3000", MACHINE, lambda: self.now, self.transport)

    def tearDown(self):
        self.temp.cleanup()

    def sign(self, payload):
        raw = json.dumps({"vendor": "qatools", "version": 2, "keyId": "test-v2", **payload}, separators=(",", ":")).encode()
        return {"payload": base64.urlsafe_b64encode(raw).decode().rstrip("="),
                "signature": base64.urlsafe_b64encode(self.signer.sign(raw)).decode().rstrip("=")}

    def license(self, products=None, **overrides):
        return self.sign({"kind": "license", "activationId": "1", "credentialId": GENERATION, "machineId": MACHINE,
                          "products": products or ["qafit01", "qavellum01"], "issuedAt": self.now,
                          "expiresAt": self.now + OFFLINE_SECONDS, **overrides})

    def denial(self, body, **overrides):
        return self.sign({"kind": "denial", "licenseDigest": license_digest(body["license"]), "nonce": body["nonce"],
                          "reason": "assignment_inactive", "issuedAt": self.now, **overrides})

    def transport(self, endpoint, body, key):
        self.calls.append((endpoint, body, key))
        return self.handler(endpoint, body, key)

    def activate(self):
        return self.client.activate(KEY)

    def test_one_activation_all_owned_tools_and_no_key_saved(self):
        self.activate()
        self.assertEqual(len(self.calls), 1)
        self.assertNotIn(KEY, self.client.path.read_text())
        self.client.require_product("qafit01")
        self.client.require_product("qavellum01")
        self.assertEqual(len(self.calls), 1)  # no network while cooking
        with self.assertRaises(LicenseError):
            self.client.require_product("unowned")

    def test_signed_identity_and_explicit_local_clear(self):
        proof = self.license(accountEmail="owner@example.com", activatedAt=self.now - 86400)
        self.client._save({"license": proof})
        status = self.client.status()
        self.assertEqual(status["accountEmail"], "owner@example.com")
        self.assertEqual(status["activatedAt"], self.now - 86400)
        for patch in ({"accountEmail": "forged"}, {"activatedAt": self.now + 1000}):
            with self.assertRaises(LicenseError):
                verify_license(self.license(**patch), self.keys, MACHINE, self.now)
        self.client.clear_local_license()
        self.assertFalse(self.client.status()["valid"])
        with self.assertRaises(LicenseError):
            self.client.require_product("qafit01")
        self.assertEqual(self.calls, [])

    def test_machine_algorithm_matches_existing_prototype(self):
        with patch("platform.node", return_value="PC"), patch("platform.system", return_value="Windows"), patch("platform.machine", return_value="AMD64"):
            self.assertEqual(get_machine_id(), hashlib.sha256(b"PCWindowsAMD64").hexdigest()[:16].upper())

    def test_tamper_wrong_machine_unknown_key_and_legacy_format_rejected(self):
        proof = self.license()
        for invalid in [{**proof, "payload": base64.urlsafe_b64encode(b"{}").decode().rstrip("=")},
                        {**proof, "signature": "a" * 86}, "qatools|MACHINE|PERPETUAL|ALL|1|old"]:
            with self.assertRaises(LicenseError):
                verify_license(invalid, self.keys, MACHINE, self.now)
        with self.assertRaises(LicenseError):
            verify_license(proof, self.keys, "FEDCBA9876543210", self.now)
        with self.assertRaises(LicenseError):
            verify_license(proof, {}, MACHINE, self.now)

    def test_expiry_exact_boundary_and_expired_proof_can_renew(self):
        self.activate()
        self.now += OFFLINE_SECONDS - 1
        self.client.require_product("qafit01")
        self.now += 1
        with self.assertRaises(LicenseError):
            self.client.require_product("qafit01")
        self.assertTrue(self.client.refresh(force=True)["renewed"])
        self.client.require_product("qafit01")

    def test_clock_before_issuance_and_invalid_duration_rejected(self):
        with self.assertRaises(LicenseError):
            verify_license(self.license(), self.keys, MACHINE, self.now - 301)
        with self.assertRaises(LicenseError):
            verify_license(self.license(expiresAt=self.now + OFFLINE_SECONDS + 1), self.keys, MACHINE, self.now)

    def test_failed_connection_keeps_valid_license_and_daily_limit_survives_new_session(self):
        self.activate()
        self.now += 86400
        def offline(*args):
            raise TemporaryError("offline")
        self.handler = offline
        self.assertFalse(self.client.refresh()["renewed"])
        self.client.require_product("qafit01")
        other_session = Client(self.temp.name, self.keys, machine_id=MACHINE, clock=lambda: self.now, transport=self.transport)
        before = len(self.calls)
        self.assertFalse(other_session.refresh()["renewed"])
        self.assertEqual(len(self.calls), before)
        self.now += OFFLINE_SECONDS
        with self.assertRaises(LicenseError):
            other_session.require_product("qafit01")

    def test_manual_refresh_can_run_before_daily_background_attempt(self):
        self.activate()
        self.assertFalse(self.client.refresh()["renewed"])
        self.assertTrue(self.client.refresh(force=True)["renewed"])
        self.assertEqual(self.calls[-1][0], "/api/licensing/renew")
        self.assertIsNone(self.calls[-1][2])  # no account key used for renewal

    def test_signed_release_denial_blocks_cached_license_and_never_reactivates(self):
        self.activate()
        self.handler = lambda endpoint, body, key: (403, {"denial": self.denial(body)})
        with self.assertRaises(LicenseError):
            self.client.refresh(force=True)
        with self.assertRaises(LicenseError):
            self.client.require_product("qafit01")
        other_session = Client(self.temp.name, self.keys, machine_id=MACHINE, clock=lambda: self.now)
        self.assertFalse(other_session.status()["valid"])
        self.assertEqual([call[0] for call in self.calls], ["/api/licensing/activate", "/api/licensing/renew"])

    def test_unsigned_http_denial_cannot_disable_working_offline_license(self):
        self.activate()
        self.handler = lambda *args: (403, {"error": "untrusted proxy response"})
        self.assertFalse(self.client.refresh(force=True)["renewed"])
        self.client.require_product("qafit01")

    def test_stale_nonce_or_wrong_license_denial_not_persisted(self):
        self.activate()
        for overrides in [{"nonce": "0" * 32}, {"licenseDigest": "0" * 64}, {"issuedAt": self.now - 301}]:
            self.handler = lambda endpoint, body, key: (403, {"denial": self.denial(body, **overrides)})
            with self.assertRaises(LicenseError):
                self.client.refresh(force=True)
            self.client.require_product("qafit01")
            self.assertNotIn("denial", self.client._load())

    def test_renewal_changes_product_scope_and_rejects_changed_assignment(self):
        self.activate()
        self.handler = lambda *args: (200, {"license": self.license(products=["qafit01"])})
        self.assertTrue(self.client.refresh(force=True)["renewed"])
        with self.assertRaises(LicenseError):
            self.client.require_product("qavellum01")
        for overrides in [{"activationId": "2"}, {"credentialId": "00000000-0000-4000-8000-000000000002"}]:
            self.handler = lambda *args: (200, {"license": self.license(**overrides)})
            with self.assertRaises(LicenseError):
                self.client.refresh(force=True)
            self.client.require_product("qafit01")

    def test_no_license_never_automatically_activates(self):
        self.assertFalse(self.client.refresh()["renewed"])
        self.assertEqual(self.calls, [])

    def test_interrupted_atomic_write_keeps_original_license(self):
        self.activate()
        original = self.client.path.read_bytes()
        with patch("qatools_licensing.client.os.replace", side_effect=OSError("interrupted")):
            with self.assertRaises((OSError, LicenseError)):
                self.client._save({"license": self.license(products=["other"])})
        self.assertEqual(self.client.path.read_bytes(), original)
        self.assertEqual(list(Path(self.temp.name).glob("*.tmp")), [])

    def test_server_address_rejects_remote_plain_http_and_userinfo(self):
        for address in ["http://example.com", "https://user:password@example.com", "https://example.com?query=1"]:
            with self.assertRaises(TemporaryError):
                http_request(address, "/api/licensing/activate", {}, KEY, allow_localhost=True)


if __name__ == "__main__":
    unittest.main()
