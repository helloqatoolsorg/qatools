import ast
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import zipfile
import hashlib


class PortableAuthoringTests(unittest.TestCase):
    def test_portable_archive_installs_without_access_to_the_repository(self):
        source = Path(__file__).resolve().parents[1] / "houdini" / "authoring"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "dist"
            for _ in range(2):
                result = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(source / "build-portable.ps1"), "-OutputDirectory", str(output)], capture_output=True, text=True, timeout=45)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            for version in ("21", "22"):
                with zipfile.ZipFile(output / ("qatools-authoring-houdini" + version + ".zip")) as archive:
                    manifest = json.loads(archive.read("authoring-kit.json"))
                    for name, digest in manifest["files"].items():
                        self.assertEqual(hashlib.sha256(archive.read(name)).hexdigest(), digest)
                    self.assertNotIn("qatools_licensing", " ".join(archive.namelist()))
                    extracted = root / ("kit" + version)
                    archive.extractall(extracted)
                prefs = root / ("other-computer-houdini" + version)
                installed = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(extracted / "install-authoring.ps1"), "-HoudiniVersion", version + ".0", "-HoudiniPreferences", str(prefs)], capture_output=True, text=True, timeout=45)
                self.assertEqual(installed.returncode, 0, installed.stdout + installed.stderr)
                self.assertTrue((prefs / "packages/qatools-authoring/scripts/python/qatools_authoring/export_worker.py").is_file())

    def test_modules_parse_with_python_311_and_install_in_both_preference_folders(self):
        source = Path(__file__).resolve().parents[1] / "houdini" / "authoring"
        for name in ("__init__.py", "prepare_tool.py", "prepared_tool.py", "export_worker.py"):
            ast.parse((source / name).read_text(encoding="utf-8"), feature_version=(3, 11))
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for version in ("21.0", "22.0"):
                prefs = root / ("houdini" + version)
                legacy = prefs / "packages/qatools-authoring/python3.13libs/qatools_authoring"
                legacy.mkdir(parents=True)
                (legacy / "old.py").write_text("original backup")
                for _ in range(2):
                    result = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(source / "install-authoring.ps1"), "-HoudiniVersion", version, "-HoudiniPreferences", str(prefs)], capture_output=True, text=True, timeout=45)
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                package = prefs / "packages/qatools-authoring"
                for name in ("__init__.py", "prepare_tool.py", "prepared_tool.py", "export_worker.py"):
                    self.assertEqual((package / "scripts/python/qatools_authoring" / name).read_bytes(), (source / name).read_bytes())
                self.assertFalse(legacy.exists())
                backup = list((package / "backups").glob("*/python3.13libs/qatools_authoring/old.py"))
                self.assertEqual(len(backup), 1)
                self.assertEqual(backup[0].read_text(), "original backup")
                config = json.loads((prefs / "packages/qatools-authoring.json").read_text())
                self.assertEqual(config["path"][0]["HOUDINI_PATH"], "$qatools_authoring")
