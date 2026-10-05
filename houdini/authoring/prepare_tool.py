"""Prepare a copy of a saved single-output SOP asset for qatools publication."""
import ast
import json
from pathlib import Path
import tempfile
import uuid

from .prepared_tool import identity, export_definition

MARKER = "qatools-preparation.json"
GUARD = "qatools_license_guard"
PARAMETERS = ("license_state", "license_email", "license_machine", "license_date",
              "activate_online", "clear_local_license", "qatools_license", "qatools_license_gap")
GUARD_CODE = "hou.pwd().parent().hdaModule()._qatools_require()"


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
    return houdini_ui.require_license_or_fail(_qatools_slug)

def _qatools_field(field):
    try:
        from qatools_licensing import houdini_ui
        return houdini_ui.license_field(field, _qatools_slug)
    except ImportError:
        return "\\u274c inactive" if field == "state" else "\\u2014"

def _qatools_setup(node):
    import hou
    for field in ("state", "email", "machine", "date"):
        parm = node.parm("license_" + field)
        if parm is not None:
            parm.setExpression('hou.pwd().hdaModule()._qatools_field("' + field + '")', hou.exprLanguage.Python)

def _qatools_recook_all():
    import hou
    # The shared cache covers every owned tool; refresh existing instances too.
    for node in hou.node("/").allSubChildren():
        definition = node.type().definition()
        if definition is None or "qatools-preparation.json" not in definition.sections():
            continue
        node.hdaModule()._qatools_setup(node)
        for target in (node.node("qatools_license_guard"), node):
            if target is not None:
                try:
                    target.cook(force=True)
                except hou.OperationFailed:
                    pass

def _qatools_activate(node):
    from qatools_licensing import houdini_ui
    houdini_ui.show_account_dialog()
    _qatools_recook_all()

def _qatools_clear(node):
    from qatools_licensing import houdini_ui
    houdini_ui.clear_local_license()
    _qatools_recook_all()
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
    for name in PARAMETERS:
        if group.find(name) is not None:
            raise ValueError("An existing parameter conflicts with qatools licensing: " + name)
    folder = hou.FolderParmTemplate("qatools_license", "License", folder_type=hou.folderType.Simple)
    for field, label in (("state", "State"), ("email", "E-mail"), ("machine", "Machine"), ("date", "Date")):
        parm = hou.StringParmTemplate("license_" + field, label, 1)
        parm.setConditional(hou.parmCondType.DisableWhen, "{ 1 }")
        folder.addParmTemplate(parm)
    activate = hou.ButtonParmTemplate("activate_online", "License key activation")
    activate.setScriptCallback('kwargs["node"].hdaModule()._qatools_activate(kwargs["node"])')
    activate.setScriptCallbackLanguage(hou.scriptLanguage.Python)
    folder.addParmTemplate(activate)
    folder.addParmTemplate(hou.SeparatorParmTemplate("qatools_license_gap"))
    clear = hou.ButtonParmTemplate("clear_local_license", "Clear local license")
    clear.setScriptCallback('kwargs["node"].hdaModule()._qatools_clear(kwargs["node"])')
    clear.setScriptCallbackLanguage(hou.scriptLanguage.Python)
    folder.addParmTemplate(clear)
    group.append(folder)
    definition.setParmTemplateGroup(group)


def prepare(node, destination):
    """Return export metadata; never change the selected asset or its library."""
    import hou
    definition = node.type().definition()
    if definition is None or not node.matchesCurrentDefinition():
        raise ValueError("Save and lock the asset definition in Houdini before preparing it.")
    label, internal = definition.description(), definition.nodeTypeName()
    extension = Path(definition.libraryFilePath()).suffix.lower()
    slug = internal.lower()
    identity(label, internal, slug + extension, b"INDX" + b"x" * 25)
    sections = definition.sections()
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
    target = Path(destination)
    if target.exists() or target.suffix.lower() != ".zip":
        raise ValueError("Choose a new ZIP path; existing exports are retained.")
    # A uniquely named staging definition prevents replacing loaded user tools.
    staging_name = "qatools_staging_" + uuid.uuid4().hex
    geometry = None
    with hou.undos.disabler(), tempfile.TemporaryDirectory(prefix="qatools-prepare-") as temporary:
        library = str(Path(temporary) / ("staging" + extension))
        definition.copyToHDAFile(library, new_name=staging_name)
        library_installed = False
        try:
            hou.hda.installFile(library, change_oplibraries_file=False)
            library_installed = True
            staged_definition = hou.hda.definitionsInFile(library)[0]
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
            final_path = str(Path(temporary) / (slug + extension))
            staged_definition.copyToHDAFile(final_path, new_name=internal, new_menu_name=label)
            final = hou.hda.definitionsInFile(final_path)[0]
            if final.sections()[MARKER].contents() != json.dumps({"schema": 1, "slug": slug, "guard": GUARD}):
                raise ValueError("Prepared definition validation failed.")
            return export_definition(final, target)
        finally:
            if geometry is not None:
                geometry.destroy()
            if library_installed:
                hou.hda.uninstallFile(library, change_oplibraries_file=False)


def shelf_action():
    import hou
    try:
        selected = hou.selectedNodes()
        if len(selected) != 1:
            raise ValueError("Select one saved SOP digital asset to prepare.")
        path = hou.ui.selectFile(title="Export prepared qatools tool", file_type=hou.fileType.Any,
                                 chooser_mode=hou.fileChooserMode.Write, pattern="*.zip")
        if not path:
            return
        result = prepare(selected[0], hou.expandString(path))
        hou.ui.displayMessage("Prepared " + result["label"] + ". Upload this ZIP through New product → Tool.", title="qatools")
    except (ValueError, OSError, hou.Error) as error:
        hou.ui.displayMessage(str(error), title="qatools", severity=hou.severityType.Error)
