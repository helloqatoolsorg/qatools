import sys
import types
import unittest
from unittest.mock import Mock, patch
from qatools_licensing import houdini_ui
from qatools_licensing.client import LicenseError

class DialogTests(unittest.TestCase):
    def run_action(self, action, text=""):
        client = Mock()
        client.status.return_value = {"valid": True, "products": ["qafit01"], "validUntil": "not-for-display"}
        client.refresh.return_value = {"renewed": True, "validUntil": "not-for-display"}
        ui = Mock()
        ui.readMultiInput.return_value = (action, (text,))
        hou = types.SimpleNamespace(ui=ui, severityType=types.SimpleNamespace(Error="error"))
        with patch.dict(sys.modules, {"hou": hou}), patch.object(houdini_ui, "default_client", return_value=client):
            houdini_ui.show_account_dialog()
        return client, ui

    def test_direct_masked_entry_has_all_actions_and_no_expiry(self):
        client, ui = self.run_action(2)
        ui.readMultiInput.assert_called_once()
        args, kwargs = ui.readMultiInput.call_args
        self.assertEqual(args[0], "")
        self.assertNotIn("QA Tools", args[0])
        self.assertNotIn("not-for-display", args[0])
        self.assertEqual(kwargs["password_input_indices"], (0,))
        self.assertEqual(kwargs["buttons"], ("Activate", "Refresh", "Close"))
        self.assertEqual(kwargs["close_choice"], 2)
        self.assertEqual(kwargs["title"], "qatools license key activation")
        ui.displayMessage.assert_not_called()

    def test_close_does_not_activate_or_refresh(self):
        client, ui = self.run_action(2, "synthetic-key")
        client.activate.assert_not_called()
        client.refresh.assert_not_called()

    def test_activate_uses_only_the_entered_key(self):
        client, ui = self.run_action(0, "synthetic-key")
        client.activate.assert_called_once_with("synthetic-key")
        client.refresh.assert_not_called()
        self.assertNotIn("not-for-display", ui.displayMessage.call_args.args[0])

    def test_refresh_needs_no_account_key(self):
        client, ui = self.run_action(1)
        client.refresh.assert_called_once_with(force=True)
        client.activate.assert_not_called()
        self.assertEqual(ui.displayMessage.call_args.args[0], "qatools license refreshed.")

    def test_invalid_key_shows_error_without_another_entry_dialog(self):
        client = Mock()
        client.status.return_value = {"valid": False, "message": "NOT ACTIVATED"}
        client.activate.side_effect = LicenseError("Enter your qatools account activation key.")
        ui = Mock()
        ui.readMultiInput.return_value = (0, ("",))
        hou = types.SimpleNamespace(ui=ui, severityType=types.SimpleNamespace(Error="error"))
        with patch.dict(sys.modules, {"hou": hou}), patch.object(houdini_ui, "default_client", return_value=client):
            houdini_ui.show_account_dialog()
        ui.readMultiInput.assert_called_once()
        self.assertEqual(ui.displayMessage.call_args.kwargs["severity"], "error")
        client.refresh.assert_not_called()
