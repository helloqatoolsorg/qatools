"""Shared account licensing. Normal tool checks are local; keys are never cached."""
import base64
import hashlib
import json
import os
import platform
import re
import secrets
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

# Houdini may lack OpenSSL's optional legacy provider. Ed25519 does not use it.
# Filter only this exact optional-provider warning during our imports; keep all
# other warnings, process crypto settings and signature failures unchanged.
import warnings
with warnings.catch_warnings():
    warnings.filterwarnings(
        "ignore",
        message=r"^OpenSSL 3's legacy provider failed to load\. Legacy algorithms will not be available\. If you need those algorithms, check your OpenSSL configuration\.$",
        category=Warning,
    )
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from . import config

OFFLINE_SECONDS = 30 * 24 * 60 * 60
MAX_BYTES = 131072
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
_thread_lock = threading.RLock()


class LicenseError(Exception):
    pass


class TemporaryError(LicenseError):
    pass


def get_machine_id():
    # Preserves the working prototype algorithm; never add the Houdini version.
    raw = platform.node() + platform.system() + platform.machine()
    return hashlib.sha256(raw.encode()).hexdigest()[:16].upper()


def default_cache_dir():
    if os.name == "nt":
        base = os.environ.get("LOCALAPPDATA")
        if not base:
            raise LicenseError("The local user-data directory is unavailable.")
        return Path(base) / "QATools" / "licenses"
    if platform.system() == "Darwin":
        return Path.home() / "Library" / "Application Support" / "QATools" / "licenses"
    return Path(os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local" / "share"))) / "QATools" / "licenses"


def _decode(value, max_length):
    if not isinstance(value, str) or not value or len(value) > max_length or not re.fullmatch(r"[A-Za-z0-9_-]+", value):
        raise LicenseError("Invalid signed license encoding.")
    data = base64.b64decode(value + "=" * (-len(value) % 4), altchars=b"-_", validate=True)
    if base64.urlsafe_b64encode(data).decode().rstrip("=") != value:
        raise LicenseError("Invalid signed license encoding.")
    return data


def _signed_payload(envelope, public_keys):
    if not isinstance(envelope, dict):
        raise LicenseError("A signed qatools license is required.")
    try:
        raw = _decode(envelope.get("payload"), 100000)
        signature = _decode(envelope.get("signature"), 86)
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            raise LicenseError("Invalid signed payload.")
        pem = public_keys.get(payload.get("keyId"))
        if not pem or len(signature) != 64:
            raise LicenseError("Unrecognized license signing key.")
        public_key = serialization.load_pem_public_key(pem.encode("ascii"))
        if not isinstance(public_key, Ed25519PublicKey):
            raise LicenseError("Invalid verification algorithm.")
        public_key.verify(signature, raw)
        if payload.get("vendor") != "qatools" or type(payload.get("version")) is not int or payload["version"] != 2:
            raise LicenseError("Unsupported qatools license format.")
        return payload
    except LicenseError:
        raise
    except Exception:
        raise LicenseError("The license signature or format is invalid.") from None


def verify_license(envelope, public_keys, machine_id, now=None, allow_expired=False):
    payload = _signed_payload(envelope, public_keys)
    now = int(time.time()) if now is None else int(now)
    activation_id = payload.get("activationId")
    products = payload.get("products")
    issued = payload.get("issuedAt")
    expiry = payload.get("expiresAt")
    if (payload.get("kind") != "license" or not isinstance(activation_id, str)
            or not re.fullmatch(r"[1-9][0-9]*", activation_id) or int(activation_id) > 9007199254740991
            or not isinstance(payload.get("credentialId"), str) or not UUID.fullmatch(payload["credentialId"])
            or not isinstance(payload.get("machineId"), str) or not re.fullmatch(r"[A-F0-9]{16}", payload["machineId"])
            or payload["machineId"] != machine_id
            or not isinstance(products, list) or not 1 <= len(products) <= 1000
            or any(not isinstance(p, str) or not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,127}", p) for p in products)
            or len(set(products)) != len(products)
            or type(issued) is not int or type(expiry) is not int or issued <= 0
            or expiry - issued != OFFLINE_SECONDS or issued > now + 300):
        raise LicenseError("The signed license does not match this computer or has an invalid format.")
    if not allow_expired and now >= expiry:
        raise LicenseError("Your offline license has expired. Connect to the internet and refresh the license.")
    return payload


def license_digest(envelope):
    return hashlib.sha256((envelope["payload"] + "." + envelope["signature"]).encode()).hexdigest()


def verify_denial(envelope, proof, public_keys, nonce=None, now=None):
    payload = _signed_payload(envelope, public_keys)
    now = int(time.time()) if now is None else int(now)
    if (payload.get("kind") != "denial" or payload.get("licenseDigest") != license_digest(proof)
            or payload.get("reason") not in {"assignment_inactive", "credential_changed", "account_unavailable", "no_entitlements"}
            or not isinstance(payload.get("nonce"), str) or not re.fullmatch(r"[a-f0-9]{32}", payload["nonce"])
            or (nonce is not None and payload["nonce"] != nonce)
            or type(payload.get("issuedAt")) is not int or payload["issuedAt"] <= 0 or payload["issuedAt"] > now + 300):
        raise LicenseError("Invalid renewal status proof.")
    if nonce is not None and abs(now - payload["issuedAt"]) > 300:
        raise LicenseError("The renewal status response is stale.")
    return payload


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(req.full_url, code, "Redirect refused", headers, fp)


def http_request(base_url, endpoint, body, key=None, allow_localhost=False):
    url = urllib.parse.urlsplit(base_url)
    if (url.username or url.password or url.query or url.fragment or url.path not in ("", "/")
            or (url.scheme != "https" and not (allow_localhost and url.scheme == "http" and url.hostname in {"localhost", "127.0.0.1", "::1"}))):
        raise TemporaryError("A secure qatools server address is required.")
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if key:
        headers["Authorization"] = "Bearer " + key
    request = urllib.request.Request(base_url.rstrip("/") + endpoint, data=json.dumps(body).encode(), headers=headers, method="POST")
    opener = urllib.request.build_opener(_NoRedirect())
    try:
        try:
            response = opener.open(request, timeout=10)
        except urllib.error.HTTPError as response_error:
            response = response_error
        with response:
            raw = response.read(MAX_BYTES + 1)
            if len(raw) > MAX_BYTES:
                raise TemporaryError("The licensing server response was too large.")
            result = json.loads(raw)
            if not isinstance(result, dict):
                raise TemporaryError("The licensing server response was invalid.")
            return response.code, result
    except TemporaryError:
        raise
    except Exception:
        raise TemporaryError("Could not contact the licensing server. Your cached license is unchanged.") from None


class Client:
    def __init__(self, cache_dir=None, public_keys=None, server_url=None, machine_id=None, clock=None, transport=None):
        self.cache_dir = Path(cache_dir) if cache_dir is not None else default_cache_dir()
        self.public_keys = config.PUBLIC_KEYS if public_keys is None else public_keys
        self.server_url = config.SERVER_URL if server_url is None else server_url
        self.machine_id = get_machine_id() if machine_id is None else machine_id
        self.clock = time.time if clock is None else clock
        self.transport = transport
        self.path = self.cache_dir / "account-v2.json"

    def _request(self, endpoint, body, key=None):
        if self.transport:
            return self.transport(endpoint, body, key)
        return http_request(self.server_url, endpoint, body, key, config.ALLOW_LOCALHOST_HTTP)

    def _load(self):
        if not self.path.exists():
            return {}
        try:
            if self.path.stat().st_size > MAX_BYTES:
                raise ValueError()
            result = json.loads(self.path.read_text(encoding="utf8"))
            if not isinstance(result, dict):
                raise ValueError()
            return result
        except Exception:
            raise LicenseError("The cached license is unreadable. Refresh or activate your qatools account.") from None

    def _save(self, state):
        self.cache_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        descriptor, temporary = tempfile.mkstemp(prefix="account-v2-", suffix=".tmp", dir=self.cache_dir)
        try:
            with os.fdopen(descriptor, "w", encoding="utf8") as stream:
                json.dump(state, stream, separators=(",", ":"))
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, self.path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    @contextmanager
    def _exclusive(self):
        # OS lock releases automatically on process exit; shared by multiple Houdini versions.
        self.cache_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        with _thread_lock, open(self.cache_dir / "account-v2.lock", "a+b") as lock:
            if lock.tell() == 0:
                lock.write(b"\0")
                lock.flush()
            lock.seek(0)
            try:
                if os.name == "nt":
                    import msvcrt
                    msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError:
                raise TemporaryError("Another qatools license operation is in progress.") from None
            try:
                yield
            finally:
                lock.seek(0)
                if os.name == "nt":
                    msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
                else:
                    fcntl.flock(lock.fileno(), fcntl.LOCK_UN)

    def _payload(self, state, allow_expired=False):
        proof = state.get("license")
        payload = verify_license(proof, self.public_keys, self.machine_id, self.clock(), allow_expired)
        if state.get("denial"):
            verify_denial(state["denial"], proof, self.public_keys, now=self.clock())
            raise LicenseError("This computer's license was released or revoked. Check your account before activating again.")
        return payload

    def require_product(self, slug):
        # No network here: this is the only path called by normal HDA cooking.
        state = self._load()
        if not state.get("license"):
            raise LicenseError("qatools is not activated on this computer. Open qatools account activation.")
        payload = self._payload(state)
        if slug not in payload["products"]:
            raise LicenseError("This tool is not included in your account license. Refresh after acquiring it.")
        return payload

    def status(self):
        try:
            state = self._load()
            if not state.get("license"):
                return {"valid": False, "message": "NOT ACTIVATED"}
            payload = self._payload(state)
            return {"valid": True, "products": payload["products"], "machineId": payload["machineId"],
                    "expiresAt": payload["expiresAt"], "validUntil": datetime.fromtimestamp(payload["expiresAt"], timezone.utc).isoformat()}
        except LicenseError as error:
            return {"valid": False, "message": str(error)}

    def activate(self, key):
        if not isinstance(key, str) or not re.fullmatch(r"QA_[A-Za-z0-9_-]{43}", key.strip()):
            raise LicenseError("Enter your qatools account activation key.")
        with self._exclusive():
            status, result = self._request("/api/licensing/activate", {"machineId": self.machine_id}, key.strip())
            if status != 200:
                if status == 409:
                    raise LicenseError("Your account has another active computer. Ask support to release it first.")
                raise LicenseError("Activation failed. Check your account key, owned tools and server connection.")
            proof = result.get("license")
            payload = verify_license(proof, self.public_keys, self.machine_id, self.clock())
            self._save({"license": proof, "lastAttemptAt": int(self.clock())})
            return payload

    def refresh(self, force=False):
        with self._exclusive():
            state = self._load()
            if not state.get("license"):
                return {"renewed": False, "message": "NOT ACTIVATED"}
            payload = self._payload(state, allow_expired=True)
            now = int(self.clock())
            last_attempt = state.get("lastAttemptAt", 0)
            if not force and type(last_attempt) is int and 0 <= now - last_attempt < 86400:
                return {"renewed": False, "message": "A renewal was already attempted in the last day."}
            proof = state["license"]
            nonce = secrets.token_hex(16)
            state["lastAttemptAt"] = now
            self._save(state)
            try:
                status, result = self._request("/api/licensing/renew", {"license": proof, "machineId": self.machine_id, "nonce": nonce})
            except TemporaryError:
                return {"renewed": False, "message": "Server unavailable; cached license retained."}
            if status == 200:
                renewed = result.get("license")
                next_payload = verify_license(renewed, self.public_keys, self.machine_id, self.clock())
                if next_payload["activationId"] != payload["activationId"] or next_payload["credentialId"] != payload["credentialId"]:
                    raise LicenseError("Renewal returned a different activation. Cached license retained.")
                if next_payload["issuedAt"] < payload["issuedAt"]:
                    raise LicenseError("Renewal returned an older license. Cached license retained.")
                self._save({"license": renewed, "lastAttemptAt": now})
                return {"renewed": True, "validUntil": datetime.fromtimestamp(next_payload["expiresAt"], timezone.utc).isoformat()}
            denial = result.get("denial")
            if denial:
                verify_denial(denial, proof, self.public_keys, nonce, self.clock())
                state["denial"] = denial
                self._save(state)
                raise LicenseError("This computer can no longer renew. Check your account or contact support.")
            # Unsigned HTTP errors are not trusted revocations (captive portals/proxies may emit them).
            return {"renewed": False, "message": "Renewal unavailable; cached license retained."}


_client = None


def default_client():
    global _client
    if _client is None:
        _client = Client()
    return _client
