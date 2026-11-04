"""Prepare a copy of a saved single-output SOP asset for qatools publication."""
import ast
import json
from pathlib import Path
import tempfile
import uuid


from .prepared_tool import identity, export_definition, release_names

MARKER = "qatools-preparation.json"
GUARD = "qatools_license_guard"
PARAMETERS = ("license_state", "license_email", "license_machine", "license_date",
              "license_trial", "activate_online", "clear_local_license", "qatools_license", "qatools_license_gap", "qatools_purchase", "qatools_purchase_disabled",
              "qatools_active", "qatools_connected", "license_active_heading", "license_inactive_heading", "license_trial_heading", "start_free_trial", "qatools_purchase_box", "get_license_key", "license_trial_notice", "qatools_state_gap", "qatools_trial_gap", "qatools_trial_notice", "qatools_purchase_gap")
GUARD_CODE = 'hou.pwd().parent().evalParm("qatools_license_revision")\nhou.pwd().parent().hdaModule()._qatools_require()'


def qt_bindings():
    try:
        from PySide6 import QtCore, QtWidgets
    except ImportError:
        raise ValueError("The authoring utility needs a Qt6/PySide6 build of Houdini 21 or 22.") from None
    return QtCore, QtWidgets


def expand_string(value):
    import hou
    expand = getattr(getattr(hou, "text", None), "expandString", None)
    return expand(value) if callable(expand) else hou.expandString(value)


def bridge(slug):
    # Preserve the author's PythonModule and add only our reserved functions.
    return '''
# qatools preparation bridge v1
_qatools_slug = %r

def _qatools_require():
    import hou
    try:
        from qatools_licensing import houdini_ui
    except ImportError:
        raise hou.NodeError("Install the complete qatools package before using this tool.") from None
    if getattr(houdini_ui, "RUNTIME_VERSION", 0) < 5:
        raise hou.NodeError("Update the installed qatools licensing files and restart Houdini. This tool requires runtime 5 or later.")
    return houdini_ui.require_license_or_fail(_qatools_slug)

def _qatools_field(field):
    try:
        from qatools_licensing import houdini_ui
        if field in ("active_flag", "connected"):
            status = houdini_ui.default_client().status()
            return int(bool(status.get("valid") and (field == "connected" or _qatools_slug in status.get("products", []))))
        return houdini_ui.license_field(field, _qatools_slug)
    except ImportError:
        if field in ("active_flag", "connected"):
            return 0
        if field in ("trial", "trial_notice"):
            return ""
        return "\\u274c inactive license" if field == "state" else "\\u2014"

def _qatools_purchase_state():
    try:
        from qatools_licensing import houdini_ui
    except ImportError:
        return "Purchase tool"
    helper = getattr(houdini_ui, "purchase_state", None)
    if callable(helper):
        return helper(_qatools_slug)
    # Older v2 runtimes expose owned products but no purchase UI helpers.
    status = houdini_ui.default_client().status()
    if status.get("valid"):
        if _qatools_slug in status.get("purchased", status.get("products", [])):
            return "Purchased"
        if _qatools_slug in status.get("free", []):
            return "Free tool"
    return "Purchase tool"

def _qatools_setup(node):
    import hou
    for field in ("state", "email", "machine", "date", "trial", "trial_notice"):
        parm = node.parm("license_" + field)
        if parm is not None:
            parm.setExpression('hou.pwd().hdaModule()._qatools_field("' + field + '")', hou.exprLanguage.Python)
    state = _qatools_purchase_state()
    try:
        from qatools_licensing import houdini_ui
    except ImportError:
        houdini_ui = None
    expired = bool(houdini_ui and houdini_ui.license_field("trial_notice", _qatools_slug))
    for name, field in (("qatools_active", "active_flag"), ("qatools_connected", "connected")):
        flag = node.parm(name)
        if flag is not None:
            flag.setExpression('int(hou.pwd().hdaModule()._qatools_field("' + field + '"))', hou.exprLanguage.Python)
    disabled = node.parm("qatools_purchase_disabled")
    if disabled is not None:
        disabled.set(int(state != "Purchase tool"))
    group = node.parmTemplateGroup()
    button = group.find("qatools_purchase")
    label = ("\\U0001f7e2 " + state) if expired and state == "Purchase tool" else state
    if button is not None and button.label() != label:
        button.setLabel(label)
        group.replace("qatools_purchase", button)
        node.setParmTemplateGroup(group)
    register = getattr(houdini_ui, "register_tool", None)
    if callable(register):
        register(_qatools_slug)

def _qatools_purchase(node):
    from qatools_licensing import houdini_ui
    helper = getattr(houdini_ui, "purchase_tool", None)
    if callable(helper):
        helper(_qatools_slug)
    elif _qatools_purchase_state() == "Purchase tool":
        import webbrowser
        from urllib.parse import quote
        webbrowser.open("https://www.qatools.org/purchase?tool=" + quote(_qatools_slug, safe=""))

def _qatools_recook_all():
    from qatools_licensing import houdini_ui
    houdini_ui.refresh_tool_nodes()

def _qatools_activate(node):
    from qatools_licensing import houdini_ui
    houdini_ui.show_account_dialog()
    _qatools_recook_all()

def _qatools_clear(node):
    from qatools_licensing import houdini_ui
    houdini_ui.clear_local_license()
    _qatools_recook_all()

def _qatools_trial(node):
    from qatools_licensing import houdini_ui
    helper = getattr(houdini_ui, "show_trial_dialog", None)
    if not callable(helper):
        import hou
        hou.ui.displayMessage("Install the latest qatools package to start the free trial without a key.", title="qatools")
        return
    helper(_qatools_recook_all)

def _qatools_get_key(node):
    import webbrowser
    webbrowser.open("https://www.qatools.org/user?section=license")
''' % slug


def output_plan(node):
    """Require one unambiguous output. Do not rewrite switches or branches."""
    import hou
    if node.type().category() != hou.sopNodeTypeCategory():
        raise ValueError("Preparation currently supports SOP assets only.")
    outputs = [n for n in node.children() if n.type().name() == "output"]
    display, render = node.displayNode(), node.renderNode()
    if len(outputs) > 1:
        raise ValueError("Use one output SOP. Multiple-output tools need a separate preparation review.")
    if outputs:
        outlet = outputs[0]
        if outlet.parm("outputidx").eval() != 0 or len(outlet.inputConnections()) != 1:
            raise ValueError("The output SOP must have index 0 and one connected input.")
        if display != outlet or render != outlet:
            raise ValueError("Set both display and render flags on the output SOP before preparing.")
        connection = outlet.inputConnections()[0]
        return outlet, connection.inputNode(), connection.outputIndex()
    if display is None or render != display:
        raise ValueError("Set display and render flags on the same final SOP, or use one output SOP.")
    return None, display, 0


def add_license_tab(definition):
    import hou
    group = definition.parmTemplateGroup()
    for name in PARAMETERS + ("qatools_license_revision", "qatools_controls"):
        if group.find(name) is not None:
            raise ValueError("An existing parameter conflicts with qatools licensing: " + name)
    # Tabs keep licensing out of the normal tool controls. Preserve the author's
    # complete layout inside the first tab, including any existing subfolders.
    controls = hou.FolderParmTemplate("qatools_controls", "Tool", folder_type=hou.folderType.Tabs)
    for entry in group.entries():
        controls.addParmTemplate(entry)
    folder = hou.FolderParmTemplate("qatools_license", "License", folder_type=hou.folderType.Tabs)
    revision = hou.IntParmTemplate("qatools_license_revision", "License revision", 1, default_value=(0,))
    revision.hide(True)
    folder.addParmTemplate(revision)
    for name in ("qatools_active", "qatools_connected"):
        flag = hou.IntParmTemplate(name, name, 1, default_value=(0,))
        flag.hide(True)
        folder.addParmTemplate(flag)
    for field, label in (("email", "E-mail"), ("machine", "Machine"), ("date", "Date")):
        parm = hou.StringParmTemplate("license_" + field, label, 1)
        parm.setConditional(hou.parmCondType.DisableWhen, "{ 1 }")
        folder.addParmTemplate(parm)
    folder.addParmTemplate(hou.SeparatorParmTemplate("qatools_state_gap"))
    state = hou.StringParmTemplate("license_state", "State", 1)
    state.setConditional(hou.parmCondType.DisableWhen, "{ 1 }")
    folder.addParmTemplate(state)
    folder.addParmTemplate(hou.LabelParmTemplate("qatools_license_gap", " ", column_labels=(" ",), is_label_hidden=True))
    get_key = hou.ButtonParmTemplate("get_license_key", "Get license key")
    get_key.setScriptCallback('kwargs["node"].hdaModule()._qatools_get_key(kwargs["node"])')
    get_key.setScriptCallbackLanguage(hou.scriptLanguage.Python)
    folder.addParmTemplate(get_key)
    activate = hou.ButtonParmTemplate("activate_online", "Activate")
    activate.setHelp("Opens a masked key-entry dialog. The key is never saved in this HDA or Houdini project.")
    activate.setScriptCallback('kwargs["node"].hdaModule()._qatools_activate(kwargs["node"])')
    activate.setScriptCallbackLanguage(hou.scriptLanguage.Python)
    folder.addParmTemplate(activate)
    folder.addParmTemplate(hou.SeparatorParmTemplate("qatools_trial_gap"))
    trial = hou.StringParmTemplate("license_trial", "Trial", 1)
    trial.setConditional(hou.parmCondType.DisableWhen, "{ 1 }")
    trial.setConditional(hou.parmCondType.HideWhen, '{ license_trial == "" }')
    folder.addParmTemplate(trial)
    folder.addParmTemplate(hou.LabelParmTemplate("qatools_purchase_gap", " ", column_labels=(" ",), is_label_hidden=True))
    notice = hou.StringParmTemplate("license_trial_notice", "Trial message", 1)
    notice.hide(True)
    folder.addParmTemplate(notice)
    message = hou.LabelParmTemplate("qatools_trial_notice", "Your 7-day trial has ended.\nPurchase this tool to continue.")
    if hasattr(message, "setLabelParmType") and hasattr(hou, "labelParmType"):
        message.setLabelParmType(hou.labelParmType.Message)
    message.setConditional(hou.parmCondType.HideWhen, '{ license_trial_notice == "" }')
    folder.addParmTemplate(message)
    disabled = hou.IntParmTemplate("qatools_purchase_disabled", "Purchase unavailable", 1, default_value=(0,))
    disabled.hide(True)
    folder.addParmTemplate(disabled)
    purchase = hou.ButtonParmTemplate("qatools_purchase", "Purchase tool")
    purchase.setConditional(hou.parmCondType.DisableWhen, "{ qatools_purchase_disabled == 1 }")
    purchase.setScriptCallback('kwargs["node"].hdaModule()._qatools_purchase(kwargs["node"])')
    purchase.setScriptCallbackLanguage(hou.scriptLanguage.Python)
    folder.addParmTemplate(purchase)
    tabs = hou.ParmTemplateGroup()
    tabs.append(controls)
    tabs.append(folder)
    definition.setParmTemplateGroup(tabs)


def prepare(node, destination, icon_path=None):
    """Return export metadata; never change the selected asset or its library."""
    import hou
    if hou.isUIAvailable():
        from .export_worker import prepare_isolated
        return prepare_isolated(node, destination, icon_path)
    definition = node.type().definition()
    if definition is None or not node.matchesCurrentDefinition():
        raise ValueError("Save and lock the asset definition in Houdini before preparing it.")
    if MARKER in definition.sections():
        raise ValueError("Prepare the original authoring HDA. This asset is already prepared.")
    source_internal = definition.nodeTypeName()
    label, internal = release_names(source_internal)
    source_path = Path(definition.libraryFilePath())
    if source_path.name != source_internal + ".hdalc":
        raise ValueError("Save the limited-commercial source as " + source_internal + ".hdalc.")
    extension = Path(definition.libraryFilePath()).suffix.lower()
    slug = internal.lower()
    identity(label, internal, internal + extension, b"INDX" + b"x" * 25)
    sections = definition.sections()
    icon_bytes = None
    if icon_path:
        icon_file = Path(icon_path)
        if icon_file.stat().st_size > 1024 * 1024:
            raise ValueError("Choose a PNG node icon smaller than 1 MB.")
        icon_bytes = icon_file.read_bytes()
        if icon_file.suffix.lower() != ".png" or not icon_bytes.startswith(b"\x89PNG\r\n\x1a\n") or len(icon_bytes) > 1024 * 1024:
            raise ValueError("Choose a PNG node icon smaller than 1 MB.")
    if MARKER in sections or node.node(GUARD) is not None:
        raise ValueError("Prepare the original authoring HDA. This asset is already prepared.")
    output_plan(node)
    python = sections["PythonModule"].contents() if "PythonModule" in sections else ""
    try:
        tree = ast.parse(python)
    except SyntaxError as error:
        raise ValueError("Fix the existing PythonModule syntax before preparing this tool.") from error
    if any(isinstance(n, ast.Name) and n.id.startswith("_qatools_") or
           isinstance(n, (ast.FunctionDef, ast.ClassDef)) and n.name.startswith("_qatools_") for n in ast.walk(tree)):
        raise ValueError("The existing PythonModule uses reserved _qatools_ names.")
    for event in ("OnCreated", "OnLoaded"):
        if event in sections and sections[event].contents().strip():
            options = definition.extraFileOptions()
            if options.get(event + "/IsPython") is not True:
                raise ValueError("Convert the existing " + event + " script to Python before preparation.")
    target = Path(destination).parent / (internal + ".zip")
    if target.suffix.lower() != ".zip":
        raise ValueError("Choose an export folder for the automatically named ZIP.")
    # A uniquely named staging definition prevents replacing loaded user tools.
    staging_name = "qatools_staging_" + uuid.uuid4().hex
    geometry = None
    with hou.undos.disabler(), tempfile.TemporaryDirectory(prefix="qatools-prepare-") as temporary:
        library = str(Path(temporary) / ("staging" + extension))
        definition.copyToHDAFile(library, new_name=staging_name)
        library_installed = False
        final_installed = False
        try:
            hou.hda.installFile(library, change_oplibraries_file=False)
            library_installed = True
            staged_definition = hou.hda.definitionsInFile(library)[0]
            if icon_bytes is not None:
                staged_definition.addSection("qatools-node-icon.png", icon_bytes)
                staged_definition.setIcon("opdef:/Sop/" + internal + "?qatools-node-icon.png")
            staged_definition.addSection("PythonModule", python + "\n" + bridge(slug))
            add_license_tab(staged_definition)
            geometry = hou.node("/obj").createNode("geo", run_init_scripts=False)
            staged = geometry.createNode(staging_name)
            staged.allowEditingOfContents()
            outlet, source, index = output_plan(staged)
            guard = staged.createNode("python", GUARD)
            guard.parm("python").set(GUARD_CODE)
            guard.setInput(0, source, index)
            guard.bypass(False)
            if outlet is not None:
                outlet.setInput(0, guard)
            else:
                guard.setDisplayFlag(True)
                guard.setRenderFlag(True)
            staged_definition.updateFromNode(staged)
            staged.matchCurrentDefinition()
            saved_guard = staged.node(GUARD)
            if saved_guard is None or saved_guard.isBypassed() or saved_guard.parm("python").eval() != GUARD_CODE:
                raise ValueError("The saved output guard could not be verified.")
            saved_outlet, saved_source, saved_index = output_plan(staged)
            if saved_outlet is not None:
                if saved_source != saved_guard or saved_index != 0:
                    raise ValueError("The saved output does not pass through its license guard.")
            elif saved_source != saved_guard:
                raise ValueError("The saved display/render output does not pass through its license guard.")
            staged_definition.addSection(MARKER, json.dumps({"schema": 1, "slug": slug, "guard": GUARD}))
            for event in ("OnCreated", "OnLoaded"):
                previous = sections[event].contents() if event in sections else ""
                staged_definition.addSection(event, previous + '\nkwargs["node"].hdaModule()._qatools_setup(kwargs["node"])\n')
                staged_definition.setExtraFileOption(event + "/IsPython", True)
            final_path = str(Path(temporary) / (internal + extension))
            # Assign the release identity while this disposable copy is editable.
            # Compile only when writing the exact HDA bytes that go into the ZIP.
            staged_definition.copyToHDAFile(final_path, new_name=internal, new_menu_name=label)
            final = hou.hda.definitionsInFile(final_path)[0]
            if final.sections()[MARKER].contents() != json.dumps({"schema": 1, "slug": slug, "guard": GUARD}):
                raise ValueError("Prepared definition validation failed.")
            hou.hda.installFile(final_path, change_oplibraries_file=False)
            final_installed = True
            final.setIsPreferred(True)
            release_node = geometry.createNode(internal)
            release_node.allowEditingOfContents()
            return export_definition(final, target, template_node=release_node, staging_parent=temporary)
        finally:
            if geometry is not None:
                geometry.destroy()
            if final_installed:
                hou.hda.uninstallFile(final_path, change_oplibraries_file=False)
            if library_installed:
                hou.hda.uninstallFile(library, change_oplibraries_file=False)


def export_dialog(definition):
    import hou
    QtCore, QtWidgets = qt_bindings()
    settings = QtCore.QSettings("qatools", "dev-export")
    label, internal = release_names(definition.nodeTypeName())
    source = Path(definition.libraryFilePath()).resolve()
    default = source.parent / "exports"
    for parent in source.parents:
        if parent.name == "qatools_dev":
            default = parent.parent / "qatools"
            break
    dialog = QtWidgets.QDialog(hou.qt.mainWindow())
    dialog.setWindowTitle("Export qatools tool")
    dialog.setMinimumWidth(650)
    layout = QtWidgets.QVBoxLayout(dialog)
    layout.addWidget(QtWidgets.QLabel("Select an export folder. Filenames are generated from the selected asset."))
    form = QtWidgets.QFormLayout()
    layout.addLayout(form)
    folder = QtWidgets.QLineEdit(str(settings.value("export_folder", str(default))))
    browse = QtWidgets.QPushButton("Browse…")
    row = QtWidgets.QHBoxLayout()
    row.addWidget(folder)
    row.addWidget(browse)
    form.addRow("Export folder", row)
    icon = QtWidgets.QLineEdit(str(settings.value("node_icon", "")))
    icon.setPlaceholderText("Optional PNG icon — leave empty to keep the source icon")
    icon_browse = QtWidgets.QPushButton("Browse…")
    icon_row = QtWidgets.QHBoxLayout()
    icon_row.addWidget(icon)
    icon_row.addWidget(icon_browse)
    form.addRow("Node miniature", icon_row)
    def choose_icon():
        chosen, _ = QtWidgets.QFileDialog.getOpenFileName(dialog, "Node icon", icon.text(), "PNG image (*.png)")
        if chosen:
            icon.setText(chosen)
            settings.setValue("node_icon", chosen)
            settings.sync()
    icon_browse.clicked.connect(choose_icon)
    for title, value in (("Source Internal Name", definition.nodeTypeName()), ("Release name", label),
                         ("Black-box HDA in ZIP", internal + ".hdalc"), ("ZIP filename", internal + ".zip")):
        preview = QtWidgets.QLineEdit(value)
        preview.setReadOnly(True)
        form.addRow(title, preview)
    full_path = QtWidgets.QLineEdit()
    full_path.setReadOnly(True)
    form.addRow("Full export path", full_path)
    def update_path():
        full_path.setText(str(Path(expand_string(folder.text().strip())).expanduser().resolve() / (internal + ".zip")))
    folder.textChanged.connect(update_path)
    update_path()
    def choose_folder():
        chosen = QtWidgets.QFileDialog.getExistingDirectory(dialog, "Export folder", folder.text())
        if chosen:
            folder.setText(chosen)
            settings.setValue("export_folder", chosen)
            settings.sync()
    browse.clicked.connect(choose_folder)
    buttons = QtWidgets.QDialogButtonBox(QtWidgets.QDialogButtonBox.StandardButton.Ok | QtWidgets.QDialogButtonBox.StandardButton.Cancel)
    buttons.button(QtWidgets.QDialogButtonBox.StandardButton.Ok).setText("Export ZIP")
    buttons.accepted.connect(dialog.accept)
    buttons.rejected.connect(dialog.reject)
    layout.addWidget(buttons)
    if dialog.exec() != QtWidgets.QDialog.DialogCode.Accepted:
        return None
    if not folder.text().strip():
        raise ValueError("Choose an export folder.")
    target = Path(full_path.text())
    target.parent.mkdir(parents=True, exist_ok=True)
    icon_text = expand_string(icon.text().strip())
    selected_icon = str(Path(icon_text).expanduser().resolve()) if icon_text else None
    if selected_icon and not Path(selected_icon).is_file():
        raise ValueError("The selected node icon does not exist.")
    settings.setValue("export_folder", str(target.parent))
    settings.setValue("node_icon", selected_icon or "")
    settings.sync()
    return target, selected_icon


def shelf_action():
    import hou
    try:
        selected = hou.selectedNodes()
        if len(selected) != 1:
            raise ValueError("Select one saved SOP digital asset to prepare.")
        definition = selected[0].type().definition()
        if definition is None:
            raise ValueError("Select a saved development HDA.")
        selection = export_dialog(definition)
        if not selection:
            return
        path, icon_path = selection
        result = prepare(selected[0], path, icon_path=icon_path)
        hou.ui.displayMessage("Prepared black-box export: " + result["label"] + ". Your source HDA is unchanged. Upload this ZIP through New product → Tool.", title="qatools")
    except (ValueError, OSError, hou.Error) as error:
        hou.ui.displayMessage(str(error), title="qatools", severity=hou.severityType.Error)
