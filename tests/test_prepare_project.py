"""Project exports must use release HDAs throughout the visible scene."""
from pathlib import Path
from types import SimpleNamespace
import json
import tempfile
import zipfile
import unittest

from houdini.authoring.prepare_project import inspect_nodes, export_project, find_resources


def asset(internal, library="Embedded", marker=None, path="/obj/geo/tool", children=()):
    definition = SimpleNamespace(
        nodeTypeName=lambda: internal,
        libraryFilePath=lambda: library,
        sections=lambda: {} if marker is None else {
            "qatools-preparation.json": SimpleNamespace(contents=lambda: json.dumps(marker))
        },
    )
    kind = SimpleNamespace(definition=lambda: definition, name=lambda: internal,
        category=lambda: SimpleNamespace(name=lambda: "Sop"))
    return SimpleNamespace(type=lambda: kind, path=lambda: path, children=lambda: list(children))


def inspect(*nodes):
    class Error(Exception):
        pass

    hou = SimpleNamespace(
        node=lambda _: SimpleNamespace(children=lambda: nodes),
        Error=Error, PermissionError=Error,
    )
    return inspect_nodes(hou, Path(__file__).resolve().parent / "factory")


class ProjectDevelopmentHdaTests(unittest.TestCase):
    def test_development_type_and_versioned_names_are_blocked(self):
        for name in ("QA_Tool_dev", "qatools::QA_Tool_dev::1.0", "QA_Tool_DEV"):
            with self.subTest(name=name):
                tools, warnings, errors = inspect(asset(name))
                self.assertFalse(tools)
                self.assertFalse(warnings)
                self.assertEqual(len(errors), 1)
                self.assertIn("/obj/geo/tool", errors[0])
                self.assertIn("QA HDA auth", errors[0])

    def test_development_library_is_blocked_even_with_release_type(self):
        _, _, errors = inspect(asset("QA_Tool", library="QA_Tool_dev.hdalc"))
        self.assertIn("Development HDA", errors[0])

    def test_development_type_cannot_bypass_check_with_prepared_marker(self):
        tools, _, errors = inspect(asset("QA_Tool_dev", marker={"schema": 1, "slug": "qa_tool"}))
        self.assertFalse(tools)
        self.assertTrue(errors)

    def test_release_identity_is_collected_and_instance_name_can_contain_dev(self):
        tools, warnings, errors = inspect(asset("QA_Tool", marker={"schema": 1, "slug": "qa_tool"},
            path="/obj/geo/my_dev_instance"))
        self.assertEqual(tools, {"qa_tool": ["/obj/geo/my_dev_instance"]})
        self.assertFalse(warnings)
        self.assertFalse(errors)

    def test_nested_development_asset_is_found_and_other_dependencies_still_warn(self):
        parent = asset("Vendor_Tool", children=[asset("QA_Tool_dev", path="/obj/geo/vendor/child")])
        _, warnings, errors = inspect(parent)
        self.assertEqual(warnings, {"Sop/Vendor_Tool": "/obj/geo/tool"})
        self.assertIn("/obj/geo/vendor/child", errors[0])


class ProjectReferenceTests(unittest.TestCase):
    def test_missing_and_nonrelative_paths_name_each_parameter_and_reference(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            class Error(Exception):
                pass
            references = [('/obj/geo/file/file', '$HIP/missing.bgeo.sc'),
                          ('/mat/texture/map', str(root / 'texture.png')),
                          ('/obj/geo/cache/file', '$HIP/cache/missing.$F4.bgeo.sc')]
            def parm(location, reference):
                return SimpleNamespace(path=lambda: location, unexpandedString=lambda: reference,
                    parmTemplate=lambda: SimpleNamespace(tags=lambda: {}))
            hou = SimpleNamespace(Error=Error,
                fileReferences=lambda: [(parm(location, reference), reference) for location, reference in references],
                expandString=lambda value: value.replace('$HIP', str(root)))
            resources, errors = find_resources(hou, root, root / 'factory', [])
            self.assertFalse(resources)
            self.assertEqual(len(errors), 3)
            for location, reference in references:
                self.assertTrue(any(location in issue and reference in issue for issue in errors))
            self.assertTrue(any('Missing file:' in issue for issue in errors))
            self.assertTrue(any('not relative to $HIP' in issue for issue in errors))

    def test_valid_resources_and_output_paths_are_handled_separately(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            (root / 'texture.png').write_bytes(b'texture')
            class Error(Exception):
                pass
            def parm(location, value, tags):
                return SimpleNamespace(path=lambda: location, unexpandedString=lambda: value,
                    parmTemplate=lambda: SimpleNamespace(tags=lambda: tags))
            hou = SimpleNamespace(Error=Error, expandString=lambda value: value.replace('$HIP', str(root)),
                fileReferences=lambda: [(parm('/mat/texture/map', '$HIP/texture.png', {}), '$HIP/texture.png'),
                    (parm('/out/render/picture', '$HIP/output.$F4.exr', {'filechooser_mode': 'write'}), '$HIP/output.$F4.exr')])
            resources, errors = find_resources(hou, root, root / 'factory', [])
            self.assertEqual(set(resources), {'texture.png'})
            self.assertFalse(errors)


class ProjectPackagingTests(unittest.TestCase):
    def test_export_keeps_original_scene_and_documents_named_customer_folder(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "088_PROJECT_NAME"
            source.mkdir()
            scene = source / "scene.hiplc"
            scene.write_bytes(b"original scene")
            resource = source / "texture.png"
            resource.write_bytes(b"original resource")
            target = export_project(scene, {"texture.png": resource}, {"qa_tool": []}, {}, "21.0.512", root)
            with zipfile.ZipFile(target) as archive:
                self.assertIsNone(archive.testzip())
                self.assertEqual(archive.read("scene.hiplc"), b"original scene")
                self.assertEqual(archive.read("texture.png"), b"original resource")
                self.assertIn("Project/Project Name/", archive.read("QATools Project README.txt").decode())
                self.assertEqual(json.loads(archive.read("qatools-project.json"))["label"], "Project Name")
            self.assertEqual(scene.read_bytes(), b"original scene")
            self.assertEqual(resource.read_bytes(), b"original resource")


if __name__ == "__main__":
    unittest.main()
