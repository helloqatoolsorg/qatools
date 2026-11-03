"""Shared Houdini activation UI. Keys are never stored on HDA node parameters."""
import threading
import platform
import re
import webbrowser
import math
from urllib.parse import quote
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
    client = default_client()
    status = client.status()
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
    if field == "trial":
        if (not status.get("valid") or product_slug in status.get("purchased", [])
                or product_slug in status.get("free", []) or product_slug not in status.get("trial", [])):
            return ""
        deadline = status.get("trialEndsAt")
        if not isinstance(deadline, (int, float)):
            return ""
        days = max(0, math.ceil((deadline - client.clock()) / 86400))
        return (str(days) + (" day remaining" if days == 1 else " days remaining")) if days else "Trial ended"
    return ""

def purchase_state(product_slug):
    status = default_client().status()
    if not status.get("valid"):
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
            hou.ui.displayMessage("qatools account activated. Free and purchased tools remain available after your seven-day trial.", title="qatools")
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
