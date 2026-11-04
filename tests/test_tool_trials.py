import queue
import sys
import types
import unittest
from unittest.mock import Mock, patch
from qatools_licensing import houdini_ui


class AutomaticTrials(unittest.TestCase):
    def setUp(self):
        houdini_ui._trial_queue = queue.Queue()
        houdini_ui._trial_updates = queue.Queue()
        houdini_ui._trial_pending.clear()
        houdini_ui._trial_attempts.clear()
        houdini_ui._trial_errors.clear()
        houdini_ui._trial_worker_running = False
        houdini_ui._trial_pump_installed = False
        houdini_ui._trial_ui_deadlines.clear()
        houdini_ui._next_trial_ui_deadline = float("inf")

    def test_many_instances_queue_one_background_request_and_update_only_on_main_pump(self):
        client = Mock()
        client._cached_payload.return_value = {"version": 4, "credentialId": "generation", "purchased": [], "free": [], "toolTrials": {}}
        client.clock.return_value = 100
        hou = types.SimpleNamespace(isUIAvailable=lambda: True, ui=Mock())
        with patch.dict(sys.modules, {"hou": hou}), patch.object(houdini_ui, "default_client", return_value=client), patch.object(houdini_ui.threading, "Thread") as thread:
            for _ in range(100):
                houdini_ui.register_tool("demo")
            self.assertEqual(houdini_ui._trial_queue.qsize(), 1)
            thread.assert_called_once()
            client.start_tool_trial.assert_not_called()
            houdini_ui._trial_worker()
            client.start_tool_trial.assert_called_once_with("demo")
            with patch.object(houdini_ui, "refresh_tool_nodes") as update:
                update.assert_not_called()
                houdini_ui._trial_pump()
                update.assert_called_once_with({"demo"})

    def test_owned_free_and_previously_started_tools_never_queue_again(self):
        client = Mock()
        client._cached_payload.return_value = {"version": 4, "credentialId": "generation", "purchased": ["owned"], "free": ["free"], "toolTrials": {"expired": {"startedAt": 1, "endsAt": 100}}}
        client.clock.return_value = 101
        hou = types.SimpleNamespace(isUIAvailable=lambda: True, ui=Mock())
        with patch.dict(sys.modules, {"hou": hou}), patch.object(houdini_ui, "default_client", return_value=client), patch.object(houdini_ui.threading, "Thread") as thread:
            for slug in ("owned", "free", "expired"):
                houdini_ui.register_tool(slug)
            self.assertTrue(houdini_ui._trial_queue.empty())
            thread.assert_not_called()

    def test_refresh_updates_dependency_without_forcing_geometry_or_simulation_cook(self):
        node = Mock()
        node.type.return_value.definition.return_value.sections.return_value = {"qatools-preparation.json": "marker"}
        module = types.SimpleNamespace(_qatools_slug="demo", _qatools_setup=Mock())
        node.hdaModule.return_value = module
        node.parm.return_value.evalAsInt.return_value = 1
        hou = types.SimpleNamespace(node=lambda _: types.SimpleNamespace(allSubChildren=lambda **_: [node]))
        with patch.dict(sys.modules, {"hou": hou}):
            houdini_ui.refresh_tool_nodes({"demo"})
        module._qatools_setup.assert_called_once_with(node)
        node.parm.return_value.set.assert_called_once_with(2)
        node.cook.assert_not_called()

    def test_trial_state_and_countdown_are_separate_from_paid_ownership(self):
        client = Mock()
        client.clock.return_value = 100
        client.status.return_value = {"valid": True, "version": 4, "products": ["demo", "owned", "free"], "purchased": ["owned"], "free": ["free"], "toolTrials": {"demo": {"startedAt": 1, "endsAt": 604801}}}
        with patch.object(houdini_ui, "default_client", return_value=client):
            self.assertEqual(houdini_ui.license_field("state", "demo"), "\u2705 active free license")
            self.assertEqual(houdini_ui.license_field("state", "owned"), "\u2705 active license")
            self.assertEqual(houdini_ui.license_field("trial", "demo"), "7 days remaining")
            self.assertEqual(houdini_ui.license_field("trial", "owned"), "")
            self.assertEqual(houdini_ui.purchase_state("demo"), "Purchase tool")

    def test_idle_expiry_updates_only_affected_tools_without_a_network_request(self):
        client = Mock()
        client.clock.return_value = 101
        houdini_ui._trial_ui_deadlines.update({"ended": 100, "future": 200})
        houdini_ui._next_trial_ui_deadline = 100
        with patch.object(houdini_ui, "default_client", return_value=client), patch.object(houdini_ui, "refresh_tool_nodes") as update:
            houdini_ui._trial_pump()
            update.assert_called_once_with({"ended"})
            client.start_tool_trial.assert_not_called()
        self.assertEqual(houdini_ui._next_trial_ui_deadline, 200)
