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
        self.client = Client(self.temp.name, self.keys, "http://127.0.0.1:3000", MACHINE, lambda: self.now, self.transport, monotonic=lambda: self.now)

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

    def test_trial_deadline_is_independent_of_offline_expiry(self):
        start = self.now - 6 * 86400
        proof = self.license(version=3, purchased=["owned"], free=["free"], trial=["demo"],
                             trialStartedAt=start, trialEndsAt=start + OFFLINE_SECONDS)
        before = verify_license(proof, self.keys, MACHINE, start + OFFLINE_SECONDS - 1)
        self.assertIn("demo", before["products"])
        after = verify_license(proof, self.keys, MACHINE, start + OFFLINE_SECONDS)
        self.assertNotIn("demo", after["products"])
        self.assertIn("owned", after["products"])
        self.assertIn("free", after["products"])
        with self.assertRaises(LicenseError):
            verify_license(self.license(version=3, purchased=[], free=[], trial=["demo"],
                trialStartedAt=start, trialEndsAt=start + OFFLINE_SECONDS + 1), self.keys, MACHINE, self.now)

    def test_one_activation_all_owned_tools_and_no_key_saved(self):
        self.activate()
        self.assertEqual(len(self.calls), 1)
        self.assertNotIn(KEY, self.client.path.read_text())
        self.client.require_product("qafit01")
        self.client.require_product("qavellum01")
        self.assertEqual(len(self.calls), 1)  # no network while cooking
        with self.assertRaises(LicenseError):
            self.client.require_product("unowned")

    def test_repeated_cooks_reuse_signature_but_detect_expiry_and_external_file_changes(self):
        import time
        self.client._save({"license": self.license()})
        with patch("qatools_licensing.client.verify_license", wraps=verify_license) as verify, patch.object(self.client, "_load", wraps=self.client._load) as read:
            started = time.perf_counter()
            for _ in range(10000):
                self.client.require_product("qafit01")
            elapsed = time.perf_counter() - started
            self.assertEqual(verify.call_count, 1)
            self.assertEqual(read.call_count, 1)
            self.assertEqual(self.calls, [])
            print("\nWarm license guard: %.2f microseconds/check over 10000 checks (client check only)." % (elapsed * 1000000 / 10000))
            self.now += OFFLINE_SECONDS
            with self.assertRaises(LicenseError):
                self.client.require_product("qafit01")
            self.assertEqual(verify.call_count, 1)
            self.client.path.write_text('{}')
            self.client._next_cache_poll = 0
            with self.assertRaises(LicenseError):
                self.client.require_product("qafit01")

    def test_individual_tool_deadlines_and_start_are_signed_and_do_not_restart(self):
        start = self.now - 6 * 86400
        proof = self.license(version=4, purchased=["owned"], free=["free"], toolTrials={
            "first": {"startedAt": start, "endsAt": start + OFFLINE_SECONDS},
            "second": {"startedAt": self.now, "endsAt": self.now + OFFLINE_SECONDS}})
        self.client._save({"license": proof})
        self.client.require_product("first")
        self.now += 86400
        with self.assertRaisesRegex(LicenseError, "Your 7-day trial has ended"):
            self.client.require_product("first")
        self.client.require_product("second")
        self.client.require_product("owned")
        self.client.require_product("free")
        with self.assertRaisesRegex(LicenseError, "Preparing this tool"):
            self.client.require_product("new")
        self.handler = lambda endpoint, body, key: (200, {"license": self.license(version=4, purchased=["owned"], free=["free"], toolTrials={"new": {"startedAt": self.now, "endsAt": self.now + OFFLINE_SECONDS}})})
        self.assertTrue(self.client.start_tool_trial("new"))
        self.assertEqual(self.calls[0][0], "/api/licensing/tool-trial")
        self.assertIsNone(self.calls[0][2])
        self.assertFalse(self.client.start_tool_trial("new"))
        self.assertEqual(len(self.calls), 1)
        self.client.require_product("new")

    def test_daily_decision_allows_expiry_grace_but_never_starts_a_fresh_window_after_expiry(self):
        from qatools_licensing.client import product_access
        end = self.now + 10
        self.client._save({"license": self.license(version=4, purchased=[], free=[], toolTrials={
            "demo": {"startedAt": end - OFFLINE_SECONDS, "endsAt": end}})})
        with patch("qatools_licensing.client.product_access", wraps=product_access) as access:
            self.client.require_product("demo")
            self.now += 11
            self.client.require_product("demo")
            self.assertEqual(access.call_count, 1)
            from qatools_licensing import houdini_ui
            with patch.object(houdini_ui, "default_client", return_value=self.client):
                self.assertEqual(houdini_ui.license_field("trial", "demo"), "Trial active until next daily check")
                self.assertEqual(houdini_ui.license_field("trial_notice", "demo"), "")
            fresh = Client(self.temp.name, self.keys, machine_id=MACHINE, clock=lambda: self.now, monotonic=lambda: self.now)
            with self.assertRaisesRegex(LicenseError, "Your 7-day trial has ended"):
                fresh.require_product("demo")
            self.now += 86400 - 11
            with self.assertRaisesRegex(LicenseError, "Your 7-day trial has ended"):
                self.client.require_product("demo")
        self.assertEqual(self.calls, [])

    def test_daily_decision_is_invalidated_by_local_and_other_session_cache_updates(self):
        self.client._save({"license": self.license()})
        self.client.require_product("qafit01")
        other = Client(self.temp.name, self.keys, machine_id=MACHINE, clock=lambda: self.now)
        other._save({})
        self.now += 1
        with self.assertRaises(LicenseError):
            self.client.require_product("qafit01")
        self.client._save({"license": self.license()})
        self.client.require_product("qafit01")
        self.client.clear_local_license()
        with self.assertRaises(LicenseError):
            self.client.require_product("qafit01")

    def test_daily_trial_cache_never_extends_the_signed_offline_lease(self):
        end = self.now + 10
        proof = self.license(version=4, purchased=[], free=[], toolTrials={
            "demo": {"startedAt": end - OFFLINE_SECONDS, "endsAt": end}},
            issuedAt=self.now - OFFLINE_SECONDS + 20, expiresAt=self.now + 20)
        self.client._save({"license": proof})
        self.client.require_product("demo")
        self.now += 11
        self.client.require_product("demo")
        self.now += 9
        with self.assertRaises(LicenseError):
            self.client.require_product("demo")

    def test_daily_cache_is_bounded_by_wall_time_after_suspend(self):
        monotonic = [0]
        self.client.monotonic = lambda: monotonic[0]
        end = self.now + 10
        self.client._save({"license": self.license(version=4, purchased=[], free=[], toolTrials={
            "demo": {"startedAt": end - OFFLINE_SECONDS, "endsAt": end}})})
        self.client.require_product("demo")
        self.now += 86400
        monotonic[0] += 2  # Simulate a platform whose monotonic clock paused in sleep.
        with self.assertRaisesRegex(LicenseError, "Your 7-day trial has ended"):
            self.client.require_product("demo")

    def test_browser_connection_requires_signed_matching_proof_and_never_caches_pairing_secret(self):
        connection = {"id": GENERATION, "token": "b" * 64, "displayCode": "123456", "expiresIn": 300}
        self.handler = lambda endpoint, body, key: (200, connection)
        self.assertEqual(self.client.begin_connection("Computer"), connection)
        self.assertFalse(self.client.path.exists())
        self.handler = lambda endpoint, body, key: (202, {"pending": True})
        self.assertFalse(self.client.finish_connection(connection))
        self.assertFalse(self.client.path.exists())
        self.handler = lambda endpoint, body, key: (200, {"license": self.license(machineId="FEDCBA9876543210")})
        with self.assertRaises(LicenseError):
            self.client.finish_connection(connection)
        self.assertFalse(self.client.path.exists())
        self.handler = lambda endpoint, body, key: (200, {"license": self.license()})
        self.assertTrue(self.client.finish_connection(connection))
        self.assertNotIn(connection["token"], self.client.path.read_text())
        self.client.require_product("qafit01")

    def test_expired_trial_has_actionable_error_without_blocking_owned_or_free_tools(self):
        start = self.now - OFFLINE_SECONDS
        proof = self.license(version=3, purchased=["owned"], free=["free"], trial=["demo"],
                             trialStartedAt=start, trialEndsAt=self.now)
        self.client._save({"license": proof})
        with self.assertRaisesRegex(LicenseError, "Your 7-day trial has ended"):
            self.client.require_product("demo")
        self.client.require_product("owned")
        self.client.require_product("free")
        self.assertEqual(self.calls, [])
        from qatools_licensing import houdini_ui
        self.now += OFFLINE_SECONDS
        with patch.object(houdini_ui, "default_client", return_value=self.client):
            self.assertEqual(houdini_ui.license_field("trial", "demo"), "Trial ended")
            self.assertIn("Purchase this tool", houdini_ui.license_field("trial_notice", "demo"))
        with self.assertRaises(LicenseError):
            self.client.require_product("owned")  # UI metadata never extends the offline lease.

    def test_trial_countdown_uses_signed_deadline_and_hides_when_owned(self):
        from qatools_licensing import houdini_ui
        proof = self.license(version=3, purchased=["owned"], free=["free"], trial=["demo", "owned", "free"],
                             trialStartedAt=self.now, trialEndsAt=self.now + OFFLINE_SECONDS)
        self.client._save({"license": proof})
        with patch.object(houdini_ui, "default_client", return_value=self.client):
            self.assertEqual(houdini_ui.license_field("trial", "demo"), "7 days remaining")
            self.assertEqual(houdini_ui.license_field("trial", "owned"), "")
            self.assertEqual(houdini_ui.license_field("trial", "free"), "")
            self.assertEqual(houdini_ui.license_field("trial", "unknown"), "")
            self.now += 6 * 86400
            self.assertEqual(houdini_ui.license_field("trial", "demo"), "1 day remaining")
            self.client._save({"license": self.license(version=3, purchased=["demo"], free=[], trial=["demo"],
                trialStartedAt=self.now - 6 * 86400, trialEndsAt=self.now + 86400)})
            self.assertEqual(houdini_ui.license_field("trial", "demo"), "")

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
                        {**proof, "signature": "a" * 86}, "QATools|MACHINE|PERPETUAL|ALL|1|old"]:
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

    def test_seven_day_request_and_legacy_cache_transition(self):
        self.activate()
        self.assertEqual(self.calls[-1][1]["offlineDays"], 7)
        old = self.license(expiresAt=self.now + 30 * 86400)
        self.client._save({"license": old})
        self.client.require_product("qafit01")
        self.assertTrue(self.client.refresh(force=True)["renewed"])
        self.assertEqual(self.calls[-1][1]["offlineDays"], 7)
        self.assertEqual(self.client._payload(self.client._load())["expiresAt"] - self.now, 7 * 86400)

    def test_throttling_and_service_failure_preserve_offline_proof(self):
        self.activate()
        original = self.client._load()["license"]
        for status in [429, 503]:
            self.handler = lambda *args: (status, {"error": "temporary"})
            self.assertFalse(self.client.refresh(force=True)["renewed"])
            self.assertEqual(self.client._load()["license"], original)
            self.client.require_product("qafit01")
            with self.assertRaises(TemporaryError):
                self.client.activate(KEY)
            self.assertEqual(self.client._load()["license"], original)

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
