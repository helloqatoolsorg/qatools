"""Fresh-interpreter checks for qatools' narrowly scoped crypto import warning."""
import pathlib
import subprocess
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1] / "houdini" / "python"


class CryptoImportTests(unittest.TestCase):
    def run_fresh(self, body):
        script = "import sys; sys.path.insert(0, " + repr(str(ROOT)) + ")\n" + body
        result = subprocess.run([sys.executable, "-c", script], capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        return result

    def test_actual_ed25519_import_is_quiet_and_still_rejects_tampering(self):
        result = self.run_fresh('''
import warnings
with warnings.catch_warnings(record=True) as captured:
    warnings.simplefilter("always")
    from qatools_licensing import client
assert not any("legacy provider failed to load" in str(w.message) for w in captured)
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
private = Ed25519PrivateKey.generate()
public = private.public_key()
message = b"qatools synthetic import check"
signature = private.sign(message)
public.verify(signature, message)
try:
    public.verify(signature, message + b"tampered")
except Exception:
    pass
else:
    raise AssertionError("Invalid signature accepted")
''')
        self.assertNotIn("legacy provider failed to load", result.stderr)

    def test_only_exact_warning_during_import_is_filtered(self):
        self.run_fresh('''
import builtins, os, warnings
message = "OpenSSL 3's legacy provider failed to load. Legacy algorithms will not be available. If you need those algorithms, check your OpenSSL configuration."
original = builtins.__import__
injected = False
environment = dict(os.environ)
def instrumented(name, *args, **kwargs):
    global injected
    if name.startswith("cryptography") and not injected:
        injected = True
        warnings.warn(message, Warning)
        warnings.warn("unrelated crypto warning", RuntimeWarning)
    return original(name, *args, **kwargs)
builtins.__import__ = instrumented
with warnings.catch_warnings(record=True) as captured:
    warnings.simplefilter("always")
    from qatools_licensing import client
    warnings.warn(message, Warning)
builtins.__import__ = original
assert injected
messages = [str(item.message) for item in captured]
assert messages.count(message) == 1, messages
assert messages.count("unrelated crypto warning") == 1, messages
assert dict(os.environ) == environment
''')


if __name__ == "__main__":
    unittest.main()
