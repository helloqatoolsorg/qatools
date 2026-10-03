"""qafit01 adapter for the shared account license; tool geometry stays unchanged."""
from qatools_licensing import houdini_ui

def require_license_or_fail():
    return houdini_ui.require_license_or_fail("qafit01")

def is_license_valid():
    return houdini_ui.is_license_valid("qafit01")

def _recook(node):
    if node is None:
        return
    import hou
    # A failed guard may remain cached after activation. Refresh it and the tool.
    guard = node.node("python1")
    for target in (guard, node):
        if target is not None:
            try:
                target.cook(force=True)
            except hou.OperationFailed:
                pass  # Houdini retains the guard's readable error on the node.

def activate_online(node=None):
    houdini_ui.show_account_dialog()
    _recook(node)

def activate_from_node(node=None):
    activate_online(node)
    return is_license_valid()
