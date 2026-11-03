"""Real Houdini preparation tests; isolated HDAs and synthetic offline license cache."""
import base64
import json
from pathlib import Path
import sys
import tempfile
import time
import unittest
import zipfile

import hou
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "houdini"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "houdini/python"))
from authoring import prepare_tool
from qatools_licensing import client, houdini_ui
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat


class PrepareTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.directory = Path(self.temp.name)
        self.geo = hou.node("/obj").createNode("geo", run_init_scripts=False)
        self.installed = []
        self.previous_client = client._client
        private = Ed25519PrivateKey.generate()
        self.private = private
        public = private.public_key().public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo).decode()
        self.license = client.Client(cache_dir=str(self.directory / "cache"), public_keys={"test-only": public},
                                     transport=lambda *args: self.fail("Cooking must stay offline"))
        client._client = self.license

    def tearDown(self):
        client._client = self.previous_client
        self.geo.destroy()
        for path in self.installed:
            if path.replace("\\", "/") in [p.replace("\\", "/") for p in hou.hda.loadedFiles()]:
                for definition in hou.hda.definitionsInFile(path):
                    definition.setIsPreferred(False)
                hou.hda.uninstallFile(path)
        self.temp.cleanup()

    def asset(self, name="Beautiful_Noise", label="Beautiful Noise", explicit=False):
        subnet = self.geo.createNode("subnet")
        source = subnet.createNode("python", "geometry_source")
        source.parm("python").set('geo=hou.pwd().geometry()\npoint=geo.createPoint()\npoint.setPosition((1,2,3))')
        final = source
        if explicit:
            final = subnet.createNode("output")
            final.setInput(0, source)
        final.setDisplayFlag(True)
        final.setRenderFlag(True)
        path = str(self.directory / (name + "_dev.hdalc"))
        asset = subnet.createDigitalAsset(name=name + "_dev", hda_file_name=path, description=label)
        self.installed.append(path)
        asset.matchCurrentDefinition()
        return asset

    def proof(self, products, expired=False):
        now = int(time.time()) - (31 * 86400 if expired else 0)
        payload = {"vendor":"qatools", "version":2,"kind":"license", "keyId":"test-only",
                   "activationId":"1", "credentialId":"00000000-0000-4000-8000-000000000001",
                   "machineId":client.get_machine_id(),"products":products,"issuedAt":now,"expiresAt":now+30*86400,
                   "accountEmail":"owner@example.com","activatedAt":now}
        encoded = json.dumps(payload, separators=(",", ":")).encode()
        b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()
        self.license._save({"license":{"payload":b64(encoded),"signature":b64(self.private.sign(encoded))}})

    def prepared_instance(self, asset, name):
        export_dir = self.directory / name
        export_dir.mkdir()
        path = export_dir / (asset.type().definition().description().replace(" ", "_") + ".zip")
        original = Path(asset.type().definition().libraryFilePath()).read_bytes()
        metadata = prepare_tool.prepare(asset, path)
        self.assertEqual(Path(asset.type().definition().libraryFilePath()).read_bytes(), original)
        self.assertTrue(asset.matchesCurrentDefinition())
        asset.allowEditingOfContents()
        self.assertFalse(asset.matchesCurrentDefinition())
        asset.matchCurrentDefinition()
        with zipfile.ZipFile(path) as archive:
            self.assertEqual(len(archive.namelist()), 2)
            self.assertEqual(json.loads(archive.read("qatools-tool.json")), metadata)
            library = self.directory / ("prepared-" + metadata["file"])
            library.write_bytes(archive.read(metadata["file"]))
        hou.hda.installFile(str(library))
        self.installed.append(str(library))
        definition = hou.hda.definitionsInFile(str(library))[0]
        definition.setIsPreferred(True)
        node = self.geo.createNode(definition.nodeTypeName())
        actual_library = node.type().definition().libraryFilePath()
        self.assertEqual(Path(actual_library).resolve(), library.resolve(), "Houdini loaded a different definition")
        diagnostic = {
            "library": actual_library,
            "isCompiled": node.isCompiled(),
            "sections": sorted(node.type().definition().sections()),
        }
        def assert_hidden():
            try:
                node.children()
            except hou.PermissionError:
                return  # Black-box network traversal is explicitly forbidden.
            self.fail("Export does not protect network traversal: " + repr(diagnostic))
        assert_hidden()
        # A fresh instance is locked. Indie permits adding nodes after unlocking,
        # but still refuses access to the original black-box network.
        try:
            probe = node.createNode("null", "qatools_editability_probe")
        except hou.Error:
            pass
        else:
            probe.destroy()
            self.fail("Fresh export is unexpectedly unlocked: " + repr(diagnostic))
        try:
            node.allowEditingOfContents()
        except hou.Error:
            pass
        assert_hidden()
        node.matchCurrentDefinition()
        return node, metadata

    def cook(self, node):
        # Exercise the public black-box boundary, never its private guard node.
        try:
            node.cook(force=True)
        except hou.OperationFailed:
            pass
        return bool(node.errors())

    def test_guard_geometry_identity_and_license_tab(self):
        node, metadata = self.prepared_instance(self.asset(), "tool")
        tabs = node.type().definition().parmTemplateGroup().entries()
        self.assertEqual([tab.label() for tab in tabs], ["Tool", "License"])
        self.assertTrue(all(tab.folderType() == hou.folderType.Tabs for tab in tabs))
        self.assertNotIn("license_state", [parm.name() for parm in tabs[0].parmTemplates()])
        self.assertIn("license_state", [parm.name() for parm in tabs[1].parmTemplates()])
        self.assertEqual(metadata["slug"], "beautiful_noise")
        self.assertTrue(self.cook(node))
        self.assertEqual(node.parm("license_state").evalAsString(), "\u274c inactive")
        self.proof([metadata["slug"]])
        node.hdaModule()._qatools_recook_all()
        self.assertFalse(self.cook(node))
        self.assertEqual(tuple(node.geometry().points()[0].position()), (1.0,2.0,3.0))
        self.assertEqual(node.parm("license_state").evalAsString(), "\u2705 active")
        self.assertEqual(node.parm("license_email").evalAsString(), "owner@example.com")
        self.assertEqual(node.parm("activate_online").parmTemplate().label(), "License key activation")
        self.assertIsNone(node.parm("license_key"))
        fields = node.parm("license_state").parmTemplate().name(), node.parm("license_machine").parmTemplate().label()
        self.assertEqual(fields, ("license_state", "Machine"))
        self.proof(["other_tool"])
        node.hdaModule()._qatools_recook_all()
        self.assertTrue(self.cook(node))
        self.proof([metadata["slug"]], expired=True)
        node.hdaModule()._qatools_recook_all()
        self.assertTrue(self.cook(node))

    def test_explicit_output_and_account_wide_callback(self):
        one, _ = self.prepared_instance(self.asset("Output_Tool", "Output Tool", explicit=True), "one")
        two, _ = self.prepared_instance(self.asset("Road_Tool", "Road Tool", explicit=True), "two")
        self.assertTrue(self.cook(one))
        self.assertTrue(self.cook(two))
        original_dialog = houdini_ui.show_account_dialog
        try:
            houdini_ui.show_account_dialog = lambda: self.proof(["output_tool", "road_tool"])
            one.parm("activate_online").pressButton()
        finally:
            houdini_ui.show_account_dialog = original_dialog
        self.assertFalse(self.cook(one))
        self.assertFalse(self.cook(two))
        self.assertEqual(two.parm("license_state").evalAsString(), "\u2705 active")
        third = self.geo.createNode("Road_Tool")
        self.assertFalse(self.cook(third))
        self.assertEqual(third.parm("license_email").evalAsString(), "owner@example.com")
        original_clear = houdini_ui.clear_local_license
        try:
            houdini_ui.clear_local_license = lambda: self.license.clear_local_license()
            one.parm("clear_local_license").pressButton()
        finally:
            houdini_ui.clear_local_license = original_clear
        for node in (one, two, third):
            self.assertTrue(self.cook(node))
            self.assertEqual(node.parm("license_state").evalAsString(), "\u274c inactive")

    def test_conflicts_and_unsaved_assets_fail_without_export(self):
        asset = self.asset("Conflict_Tool", "Conflict Tool")
        target = self.directory / "blocked.zip"
        asset.allowEditingOfContents()
        with self.assertRaisesRegex(ValueError, "Save and lock"):
            prepare_tool.prepare(asset, target)
        self.assertFalse(target.exists())
        asset.matchCurrentDefinition()
        definition = asset.type().definition()
        definition.addSection("PythonModule", "def _qatools_custom(): pass")
        with self.assertRaisesRegex(ValueError, "reserved"):
            prepare_tool.prepare(asset, target)
        self.assertFalse(target.exists())

    def test_existing_pythonmodule_is_preserved(self):
        asset = self.asset("Preserved_Tool", "Preserved Tool")
        asset.type().definition().addSection("PythonModule", "def author_function(): return 42\n")
        node, _ = self.prepared_instance(asset, "preserved")
        self.assertEqual(node.hdaModule().author_function(), 42)
        with self.assertRaisesRegex(ValueError, "already prepared"):
            prepare_tool.prepare(node, self.directory / "again.zip")

    def test_development_display_label_does_not_add_dev_to_release(self):
        asset = self.asset("QA_Tool_A", "QA Tool A dev")
        source = Path(asset.type().definition().libraryFilePath())
        original = source.read_bytes()
        result = prepare_tool.prepare(asset, self.directory / "ignored.zip")
        self.assertEqual(result["label"], "QA Tool A")
        self.assertEqual(result["internal_name"], "QA_Tool_A")
        self.assertEqual(result["file"], "QA_Tool_A.hdalc")
        self.assertTrue((self.directory / "QA_Tool_A.zip").exists())
        self.assertFalse((self.directory / "ignored.zip").exists())
        self.assertEqual(source.read_bytes(), original)

    def test_node_icon_is_embedded_in_export_without_changing_source(self):
        from PySide6 import QtGui
        icon = self.directory / "icon.png"
        image = QtGui.QImage(32, 32, QtGui.QImage.Format.Format_ARGB32)
        image.fill(0xff55aa77)
        self.assertTrue(image.save(str(icon), "PNG"))
        asset = self.asset("Icon_Tool", "Icon Tool")
        source = Path(asset.type().definition().libraryFilePath())
        before = source.read_bytes()
        result = prepare_tool.prepare(asset, self.directory / "ignored.zip", icon_path=icon)
        with zipfile.ZipFile(self.directory / "Icon_Tool.zip") as archive:
            exported = self.directory / "icon-release.hdalc"
            exported.write_bytes(archive.read(result["file"]))
        definition = hou.hda.definitionsInFile(str(exported))[0]
        self.assertIn("qatools-node-icon.png", definition.sections())
        self.assertEqual(definition.icon(), "opdef:/Sop/Icon_Tool?qatools-node-icon.png")
        self.assertEqual(source.read_bytes(), before)

    def test_unsupported_output_and_parameter_conflict_preserve_source(self):
        asset = self.asset("Unsupported_Tool", "Unsupported Tool", explicit=True)
        asset.allowEditingOfContents()
        asset.createNode("output", "second_output")
        definition = asset.type().definition()
        definition.updateFromNode(asset)
        asset.matchCurrentDefinition()
        original = Path(definition.libraryFilePath()).read_bytes()
        target = self.directory / "unsupported.zip"
        with self.assertRaisesRegex(ValueError, "Multiple-output"):
            prepare_tool.prepare(asset, target)
        self.assertEqual(Path(definition.libraryFilePath()).read_bytes(), original)
        self.assertFalse(target.exists())

        other = self.asset("Collision_Tool", "Collision Tool")
        definition = other.type().definition()
        group = definition.parmTemplateGroup()
        group.append(hou.StringParmTemplate("license_state", "Existing field", 1))
        definition.setParmTemplateGroup(group)
        original = Path(definition.libraryFilePath()).read_bytes()
        with self.assertRaisesRegex(ValueError, "parameter conflicts"):
            prepare_tool.prepare(other, target)
        self.assertEqual(Path(definition.libraryFilePath()).read_bytes(), original)
        self.assertFalse(target.exists())

    def test_existing_python_event_and_repeated_source_export(self):
        asset = self.asset("Events_Tool", "Events Tool")
        definition = asset.type().definition()
        definition.addSection("OnCreated", 'kwargs["node"].setUserData("author_event", "kept")')
        definition.setExtraFileOption("OnCreated/IsPython", True)
        node, _ = self.prepared_instance(asset, "events")
        self.assertEqual(node.userData("author_event"), "kept")
        # The original authoring definition remains reusable after exporting.
        original = hou.hda.definitionsInFile(str(self.directory / "Events_Tool_dev.hdalc"))[0]
        original.setIsPreferred(True)
        authoring = self.geo.createNode("Events_Tool_dev")
        second_dir = self.directory / "second-export"
        second_dir.mkdir()
        result = prepare_tool.prepare(authoring, second_dir / "ignored-name.zip")
        self.assertEqual(result["slug"], "events_tool")


if __name__ == "__main__":
    unittest.main()
