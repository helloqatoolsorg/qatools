"""Project exports must use release HDAs throughout the visible scene."""
from pathlib import Path
from types import SimpleNamespace
import json
import unittest

from houdini.authoring.prepare_project import inspect_nodes


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


if __name__ == "__main__":
    unittest.main()
