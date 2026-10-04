"""Shared Houdini activation UI. Keys are never stored on HDA node parameters."""
import threading
import platform
from datetime import datetime, timezone
from .client import default_client, LicenseError

def require_license_or_fail(product_slug="qafit01"):
    import hou
    try:
        return default_client().require_product(product_slug)
    except LicenseError as error:
        raise hou.NodeError(str(error)) from None

def is_license_valid(product_slug="qafit01"):
    try:
        default_client().require_product(product_slug)
        return True
    except LicenseError:
        return False

def license_field(field, product_slug="qafit01"):
    status = default_client().status()
    active = status.get("valid") and product_slug in status.get("products", [])
    if field == "state":
        return "\u2705 active" if active else "\u274c inactive"
    if field == "email":
        return status.get("accountEmail") or "\u2014"
    if field == "date":
        date = status.get("activatedAt")
        return datetime.fromtimestamp(date, timezone.utc).strftime("%Y/%m/%d") if date else "\u2014"
    if field == "machine":
        return platform.node()
    return ""

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
            buttons=("Activate", "Refresh", "Close"), title="qatools license key activation", default_choice=0, close_choice=2)
        if action == 0:
            client.activate(values[0])
            hou.ui.displayMessage("qatools account activated for all owned tools.\nMachine limit: 1 active computer per account.", title="qatools")
        elif action == 1:
            result = client.refresh(force=True)
            hou.ui.displayMessage("qatools license refreshed." if result.get("renewed") else result.get("message", "License status unchanged."), title="qatools")
    except OSError:
        hou.ui.displayMessage("qatools cannot write its local license cache. Check your account folder permissions.", severity=hou.severityType.Error, title="qatools")
    except LicenseError as error:
        hou.ui.displayMessage(str(error), severity=hou.severityType.Error, title="qatools")
    finally:
        values = ()

def start_background_renewal():
    def worker():
        try:
            default_client().refresh()
        except (LicenseError, OSError):
            pass
    threading.Thread(target=worker, name="qatools license renewal", daemon=True).start()
