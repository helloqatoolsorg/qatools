import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch, Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "houdini"))
from authoring.prepare_tool import bridge


class CompatibilityTests(unittest.TestCase):
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
