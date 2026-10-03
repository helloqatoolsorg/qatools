"""Shared Houdini activation UI. Keys are never stored on HDA node parameters."""
import threading
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
