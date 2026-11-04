import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch, Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "houdini"))
from authoring.prepare_tool import bridge


class CompatibilityTests(unittest.TestCase):
    def test_preparation_setup_does_not_require_customer_licensing_runtime(self):
        scope = {}
        exec(bridge("qa_tool_a"), scope)
        node = Mock()
        node.parmTemplateGroup.return_value.find.return_value.label.return_value = "Purchase tool"
        hou = types.SimpleNamespace(exprLanguage=types.SimpleNamespace(Python="python"))
        with patch.dict(sys.modules, {"hou": hou, "qatools_licensing": None}):
            self.assertEqual(scope["_qatools_field"]("state"), "\u274c inactive license")
            self.assertEqual(scope["_qatools_field"]("active_flag"), 0)
            self.assertEqual(scope["_qatools_purchase_state"](), "Purchase tool")
            scope["_qatools_setup"](node)
        node.parm.return_value.setExpression.assert_called()

    def test_ui_export_dispatches_to_worker_before_any_hda_operations(self):
        from authoring import prepare_tool, export_worker
        node = object()
        hou = types.SimpleNamespace(isUIAvailable=lambda: True)
        with patch.dict(sys.modules, {"hou": hou}), patch.object(export_worker, "prepare_isolated", return_value={"ok": True}) as isolated:
            self.assertEqual(prepare_tool.prepare(node, "release.zip", icon_path="icon.png"), {"ok": True})
            isolated.assert_called_once_with(node, "release.zip", "icon.png")

    def test_purchase_ui_with_legacy_runtime_and_trial_scope(self):
        scope = {}
        exec(bridge("qa_tool_a"), scope)
        status = {"valid": True, "products": ["qa_tool_a"]}
        ui = types.SimpleNamespace(default_client=lambda: types.SimpleNamespace(status=lambda: status))
        package = types.ModuleType("qatools_licensing")
        package.houdini_ui = ui
        with patch.dict(sys.modules, {"qatools_licensing": package}):
            self.assertEqual(scope["_qatools_purchase_state"](), "Purchased")
            status["purchased"] = []  # Trial scope is access, never paid ownership.
            self.assertEqual(scope["_qatools_purchase_state"](), "Purchase tool")
            with patch("webbrowser.open") as browser:
                scope["_qatools_purchase"](None)
                browser.assert_called_once_with("https://www.qatools.org/purchase?tool=qa_tool_a")
            ui.purchase_state = Mock(return_value="Free tool")
            self.assertEqual(scope["_qatools_purchase_state"](), "Free tool")
            ui.purchase_state.assert_called_once_with("qa_tool_a")
