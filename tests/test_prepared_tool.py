import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile
import json

spec = importlib.util.spec_from_file_location("prepared_tool", Path(__file__).resolve().parents[1] / "houdini/authoring/prepared_tool.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
CONTENT = b"INDX" + b"x" * 40

class Definition:
    def description(self): return "Beautiful Noise"
    def nodeTypeName(self): return "Beautiful_Noise"
    def libraryFilePath(self): return "source.hdalc"
    def copyToHDAFile(self, path): Path(path).write_bytes(CONTENT)

class PreparedTests(unittest.TestCase):
    def test_identity_and_naming(self):
        value = module.identity("Beautiful Noise", "Beautiful_Noise", "beautiful_noise.hda", CONTENT)
        self.assertEqual(value["slug"], "beautiful_noise")
        for label, internal in [("Beautiful Noise", "beautiful_noise"), ("Tool", "Tool::1.0"), ("../Tool", "../Tool"), ("Tool  Name", "Tool__Name")]:
            with self.assertRaises(ValueError): module.identity(label, internal, "tool.hda", CONTENT)

    def test_naming_errors_identify_actual_field_and_expected_name(self):
        with self.assertRaises(ValueError) as mismatch:
            module.identity("Beautiful Noise", "qatools::Beautiful_Noise::1.0", "tool.hda", CONTENT)
        message = str(mismatch.exception)
        self.assertIn("'qatools::Beautiful_Noise::1.0'", message)
        self.assertIn("Expected Internal Name: 'Beautiful_Noise'", message)
        with self.assertRaisesRegex(ValueError, "Asset Label is invalid: 'Beautiful  Noise'"):
            module.identity("Beautiful  Noise", "Beautiful__Noise", "tool.hda", CONTENT)

    def test_export_reads_definition_and_never_overwrites(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "tool.zip"
            exported = module.export_definition(Definition(), path)
            with zipfile.ZipFile(path) as archive:
                self.assertEqual(archive.namelist(), ["qatools-tool.json", "beautiful_noise.hdalc"])
                self.assertEqual(json.loads(archive.read("qatools-tool.json")), exported)
                self.assertEqual(archive.read("beautiful_noise.hdalc"), CONTENT)
            before = path.read_bytes()
            with self.assertRaises(FileExistsError): module.export_definition(Definition(), path)
            self.assertEqual(path.read_bytes(), before)

    def test_real_houdini_definition(self):
        import hou
        with tempfile.TemporaryDirectory() as directory:
            geometry = hou.node("/obj").createNode("geo")
            try:
                subnet = geometry.createNode("subnet")
                asset = subnet.createDigitalAsset(name="Beautiful_Noise", hda_file_name=str(Path(directory) / "source.hdalc"), description="Beautiful Noise")
                definition = asset.type().definition()
                original = Path(definition.libraryFilePath()).read_bytes()
                target = Path(directory) / "export.zip"
                result = module.export_definition(definition, target)
                self.assertEqual(result["slug"], "beautiful_noise")
                self.assertEqual(Path(definition.libraryFilePath()).read_bytes(), original)
                with zipfile.ZipFile(target) as archive:
                    self.assertTrue(archive.read(result["file"]).startswith(b"INDX"))
            finally: geometry.destroy()

if __name__ == "__main__": unittest.main()
