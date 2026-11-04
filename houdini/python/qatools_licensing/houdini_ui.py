"""Shared Houdini activation UI. Keys are never stored on HDA node parameters."""
import threading
import platform
import re
import webbrowser
import math
import time
import queue
from urllib.parse import quote
from datetime import datetime, timezone
from .client import default_client, LicenseError
RUNTIME_VERSION = 5

_connection_dialog = None
_trial_queue = queue.Queue()
_trial_updates = queue.Queue()
_trial_lock = threading.Lock()
_trial_worker_running = False
_trial_pump_installed = False
_trial_pending = set()
_trial_attempts = {}
_trial_errors = {}
_trial_ui_deadlines = {}
_next_trial_ui_deadline = math.inf


def refresh_tool_nodes(slugs=None):
    """Update UI/dependencies on the main thread; never force a simulation cook."""
    import hou
    for node in hou.node("/").allSubChildren(recurse_in_locked_nodes=False):
        try:
            definition = node.type().definition()
            if definition is None or "qatools-preparation.json" not in definition.sections():
                continue
            module = node.hdaModule()
            if slugs is not None and getattr(module, "_qatools_slug", None) not in slugs:
                continue
            module._qatools_setup(node)
            revision = node.parm("qatools_license_revision")
            if revision is not None:
                revision.set((revision.evalAsInt() + 1) % 1000000)

        except hou.Error:
            continue  # A deleted/obsolete instance must not interrupt other updates.

def _trial_pump():
    global _next_trial_ui_deadline
    changed = set()
    now = default_client().clock()
    if now >= _next_trial_ui_deadline:
        for slug, deadline in list(_trial_ui_deadlines.items()):
            if now >= deadline:
                changed.add(slug)
                del _trial_ui_deadlines[slug]
        _next_trial_ui_deadline = min(_trial_ui_deadlines.values(), default=math.inf)
    while True:
        try:
            changed.add(_trial_updates.get_nowait())
        except queue.Empty:
            break
    if changed:
        refresh_tool_nodes(None if "*" in changed else changed)


def _install_trial_pump():
    import hou
    global _trial_pump_installed
    if getattr(hou, "isUIAvailable", lambda: False)() and not _trial_pump_installed:
        hou.ui.addEventLoopCallback(_trial_pump)
        _trial_pump_installed = True


def register_tool(product_slug):
    """Called by creation/load/explicit refresh callbacks, never by the cook guard."""
    import hou
    if not getattr(hou, "isUIAvailable", lambda: False)():
        return
    client = default_client()
    try:
        payload = client._cached_payload()
    except (LicenseError, OSError):
        return  # The first account key must be activated explicitly.
    from .client import product_access
    access = product_access(payload, product_slug, client.clock())
    global _next_trial_ui_deadline
    trial = payload.get("toolTrials", {}).get(product_slug)
    grace = client.trial_grace_deadline(product_slug) if access == "expired" else None
    if trial and (access == "trial" or isinstance(grace, (int, float))):
        _trial_ui_deadlines[product_slug] = grace if isinstance(grace, (int, float)) else trial["endsAt"]
        _next_trial_ui_deadline = min(_trial_ui_deadlines.values())
        _install_trial_pump()
    elif product_slug in _trial_ui_deadlines:
        del _trial_ui_deadlines[product_slug]
        _next_trial_ui_deadline = min(_trial_ui_deadlines.values(), default=math.inf)
    if payload["version"] == 4 and access != "unstarted":
        return
    if access in ("purchased", "free"):
        return
    key = (payload["credentialId"], product_slug)
    global _trial_worker_running
    with _trial_lock:
        if key in _trial_pending or time.monotonic() - _trial_attempts.get(key, -1000) < 30:
            return
        _trial_pending.add(key)
        _trial_attempts[key] = time.monotonic()
        _trial_queue.put((key, client, product_slug))
        start_worker = not _trial_worker_running
        if start_worker:
            _trial_worker_running = True
    _install_trial_pump()
    if start_worker:
        threading.Thread(target=_trial_worker, name="qatools tool trial", daemon=True).start()


def _trial_worker():
    global _trial_worker_running
    while True:
        with _trial_lock:
            try:
                key, client, slug = _trial_queue.get_nowait()
            except queue.Empty:
                _trial_worker_running = False
                return
        try:
            client.start_tool_trial(slug)
            _trial_errors.pop(slug, None)
        except (LicenseError, OSError) as error:
            _trial_errors[slug] = str(error)
        finally:
            with _trial_lock:
                _trial_pending.discard(key)
            _trial_updates.put(slug)


def show_trial_dialog(on_connected=None):
    """Explicit browser approval; network work never runs in normal HDA cooking."""
    import hou
    from PySide6 import QtCore, QtWidgets
    global _connection_dialog
    if _connection_dialog is not None:
        _connection_dialog.raise_()
        _connection_dialog.activateWindow()
        return
    client = default_client()
    stopped = threading.Event()

    class Signals(QtCore.QObject):
        ready = QtCore.Signal(str, str)
        complete = QtCore.Signal()
        failed = QtCore.Signal(str)

    dialog = QtWidgets.QDialog(hou.qt.mainWindow())
    signals = Signals(dialog)
    dialog.setWindowTitle("qatools - Start free trial")
    layout = QtWidgets.QVBoxLayout(dialog)
    message = QtWidgets.QLabel("Preparing your account connection…")
    message.setWordWrap(True)
    layout.addWidget(message)
    browser = QtWidgets.QPushButton("Open qatools account")
    browser.setEnabled(False)
    layout.addWidget(browser)
    close = QtWidgets.QPushButton("Cancel")
    layout.addWidget(close)
    close.clicked.connect(dialog.reject)

    def ready(code, url):
        if stopped.is_set():
            return
        message.setText("Confirmation code: " + code + "\nConfirm this computer in your browser. No license key is needed.\nReconnecting does not restart an existing trial.")
        browser.setEnabled(True)
        browser.clicked.connect(lambda: webbrowser.open(url))
        webbrowser.open(url)

    def completed():
        if stopped.is_set():
            return
        message.setText("Account connected. Free and purchased tools remain available after the trial.")
        browser.setEnabled(False)
        close.setText("Close")
        if on_connected:
            on_connected()

    def failed(message_text):
        if not stopped.is_set():
            message.setText(message_text)
            browser.setEnabled(False)
            close.setText("Close")

    def finished(_):
        global _connection_dialog
        stopped.set()
        _connection_dialog = None

    signals.ready.connect(ready)
    signals.complete.connect(completed)
    signals.failed.connect(failed)
    dialog.finished.connect(finished)
    dialog.destroyed.connect(lambda: stopped.set())

    def worker():
        try:
            connection = client.begin_connection(platform.node())
            if stopped.is_set():
                return
            signals.ready.emit(connection["displayCode"], client.server_url.rstrip("/") + "/connect-houdini?id=" + quote(connection["id"], safe=""))
            deadline = time.monotonic() + 290
            while not stopped.wait(3):
                if time.monotonic() >= deadline:
                    raise LicenseError("Connection expired. Close this window and start again.")
                if client.finish_connection(connection):
                    if not stopped.is_set():
                        signals.complete.emit()
                    return
        except (LicenseError, OSError) as error:
            if not stopped.is_set():
                signals.failed.emit(str(error))
        except RuntimeError:
            # Qt may already be shutting down while the network thread finishes.
            stopped.set()

    _connection_dialog = dialog
    dialog.show()
    threading.Thread(target=worker, name="qatools account connection", daemon=True).start()

def require_license_or_fail(product_slug="qafit01"):
    import hou
    try:
        return default_client().require_product(product_slug)
    except LicenseError as error:
        message = str(error)
        if message.startswith("Preparing this tool"):
            if not getattr(hou, "isUIAvailable", lambda: False)():
                message = "This tool's trial has not started. Open it once in an online Houdini session before running headless."
            else:
                message = _trial_errors.get(product_slug, message)
        raise hou.NodeError(message) from None

def is_license_valid(product_slug="qafit01"):
    try:
        default_client().require_product(product_slug)
        return True
    except LicenseError:
        return False

def license_field(field, product_slug="qafit01"):
    client = default_client()
    status = client.status(include_expired=True)
    active = status.get("valid") and product_slug in status.get("products", [])
    if field == "state":
        if active:
            return "\u2705 active license" if product_slug in status.get("purchased", status.get("products", [])) else "\u2705 active free license"
        return "\u274c inactive license"
    if field == "active_flag":
        return int(bool(active))
    if field == "connected":
        return int(bool(status.get("valid")))
    if field == "email":
        return status.get("accountEmail") or "\u2014"
    if field == "date":
        date = status.get("activatedAt")
        return datetime.fromtimestamp(date, timezone.utc).strftime("%Y/%m/%d") if date else "\u2014"
    if field == "machine":
        return platform.node()
    if field == "trial":
        if ((not status.get("valid") and not status.get("expired")) or product_slug in status.get("purchased", [])
                or product_slug in status.get("free", [])):
            return ""
        if status.get("version") == 4:
            deadline = status.get("toolTrials", {}).get(product_slug, {}).get("endsAt")
        else:
            if product_slug not in status.get("trial", []):
                return ""
            deadline = status.get("trialEndsAt")
        if not isinstance(deadline, (int, float)):
            return ""
        days = max(0, math.ceil((deadline - client.clock()) / 86400))
        if days == 0 and product_slug in status.get("dailyTrialGrace", {}):
            return "Trial active until next daily check"
        return (str(days) + (" day remaining" if days == 1 else " days remaining")) if days else "Trial ended"
    if field == "trial_notice":
        return "Your 7-day trial has ended. Purchase this tool to continue." if license_field("trial", product_slug) == "Trial ended" else ""
    return ""

def purchase_state(product_slug):
    status = default_client().status(include_expired=True)
    if not status.get("valid") and not status.get("expired"):
        return "Purchase tool"
    if product_slug in status.get("purchased", []):
        return "Purchased"
    if product_slug in status.get("free", []):
        return "Free tool"
    return "Purchase tool"

def purchase_tool(product_slug):
    if not isinstance(product_slug, str) or not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,127}", product_slug):
        raise LicenseError("Invalid tool identity.")
    if purchase_state(product_slug) == "Purchase tool":
        webbrowser.open("https://www.qatools.org/purchase?tool=" + quote(product_slug, safe=""))


def get_license_key():
    webbrowser.open("https://www.qatools.org/user?section=license")

def clear_local_license():
    import hou
    if hou.ui.displayMessage("Clear the local qatools license for all tools on this computer?\nYour account ownership and server machine assignment are retained.",
            buttons=("Clear", "Cancel"), default_choice=1, close_choice=1, title="qatools") != 0:
        return
    try:
        default_client().clear_local_license()
    except (LicenseError, OSError) as error:
        hou.ui.displayMessage(str(error), severity=hou.severityType.Error, title="qatools")

def show_account_dialog():
    import hou
    client = default_client()
    values = ()
    try:
        action, values = hou.ui.readMultiInput("", ("License key",), password_input_indices=(0,),
            buttons=("Activate", "Refresh", "Close"), title="License key activation", default_choice=0, close_choice=2)
        if action == 0:
            client.activate(values[0])
            with _trial_lock:
                _trial_attempts.clear()
                _trial_errors.clear()
            hou.ui.displayMessage("qatools account connected. Unpurchased paid tools start their own seven-day trial when first placed.", title="qatools")
        elif action == 1:
            result = client.refresh(force=True)
            with _trial_lock:
                _trial_attempts.clear()
                _trial_errors.clear()
            hou.ui.displayMessage("qatools license refreshed." if result.get("renewed") else result.get("message", "License status unchanged."), title="qatools")
    except OSError:
        hou.ui.displayMessage("qatools cannot write its local license cache. Check your account folder permissions.", severity=hou.severityType.Error, title="qatools")
    except LicenseError as error:
        hou.ui.displayMessage(str(error), severity=hou.severityType.Error, title="qatools")
    finally:
        values = ()

def start_background_renewal():
    _install_trial_pump()
    def worker():
        try:
            if default_client().refresh().get("renewed"):
                _trial_updates.put("*")
        except (LicenseError, OSError):
            pass
    threading.Thread(target=worker, name="qatools license renewal", daemon=True).start()
