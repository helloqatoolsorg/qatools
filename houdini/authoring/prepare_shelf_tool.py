"""Export a standalone Python shelf action as a product ZIP."""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as xml
import zipfile

from .prepared_tool import atomic_export, release_names


def export_shelf_tool(source_name, label, script, folder, icon="MISC_python"):
    expected_label, internal_name = release_names(source_name)
    if label != expected_label or len(label) > 80:
        raise ValueError(f"Set the shelf tool label to {expected_label!r} (up to 80 characters).")
    if not script.strip():
        raise ValueError("The shelf tool has no Python script.")
    filename = internal_name + ".shelf"
    compile(script, filename, "exec")
    slug = internal_name.lower()
    tool_id = "qatools_shelf_" + slug

    root = xml.Element("shelfDocument")
    tab = xml.SubElement(root, "toolshelf", name=tool_id, label=label)
    xml.SubElement(tab, "memberTool", name=tool_id)
    if not (icon and icon.isascii() and icon.replace("_", "").isalnum()):
        icon = "MISC_python"
    tool = xml.SubElement(root, "tool", name=tool_id, label=label, icon=icon)
    xml.SubElement(tool, "helpText").text = "Shift-click for license information."
    xml.SubElement(tool, "script", scriptType="python").text = (
        "import hou\n"
        "try:\n"
        "    from qatools_licensing.houdini_ui import run_shelf_tool\n"
        "except ImportError:\n"
        "    hou.ui.displayMessage('Install the latest QATools product ZIP and restart Houdini.', title='QATools')\n"
        "else:\n"
        f"    run_shelf_tool({slug!r}, {label!r}, {script!r}, globals())\n"
    )
    content = xml.tostring(root, encoding="utf-8", xml_declaration=True)
    if len(content) > 4 * 1024 * 1024:
        raise ValueError("The prepared shelf tool exceeds 4 MB.")
    metadata = {
        "schema": 2, "label": label, "internal_name": internal_name,
        "slug": slug, "file": filename, "sha256": hashlib.sha256(content).hexdigest(),
    }
    target = Path(folder) / (internal_name + ".zip")
    with atomic_export(target) as output:
        with zipfile.ZipFile(output, "w", zipfile.ZIP_STORED) as archive:
            archive.writestr("qatools-tool.json", json.dumps(metadata))
            archive.writestr(filename, content)
    return target


def shelf_action():
    import hou
    from PySide6 import QtCore, QtWidgets

    try:
        sources = sorted(
            (tool for name, tool in hou.shelves.tools().items()
             if name.endswith("_dev") and tool.language() == hou.scriptLanguage.Python
             and tool.filePath().lower().endswith(".shelf")),
            key=lambda tool: (tool.label().casefold(), tool.name()),
        )
        if not sources:
            raise ValueError("Save a Python shelf tool with an internal name ending in _dev first.")
        selected = hou.ui.selectFromList(
            [f"{tool.label()} ({tool.name()})" for tool in sources],
            exclusive=True, title="QA Shelf Tool auth",
        )
        if not selected:
            return
        tool = sources[selected[0]]
        title, internal_name = release_names(tool.name())
        if tool.label() != title or len(title) > 80:
            raise ValueError(f"Set the shelf tool label to {title!r} (up to 80 characters).")
        settings = QtCore.QSettings("QATools", "PrepareShelfTool")
        folder = QtWidgets.QFileDialog.getExistingDirectory(
            hou.qt.mainWindow(), "Export " + internal_name + ".zip",
            settings.value("folder", str(Path.home() / "Documents")),
        )
        if not folder:
            return
        path = Path(folder) / (internal_name + ".zip")
        if hou.ui.displayMessage(
            f"Title: {title}\nSlug: {internal_name.lower()}\nZIP: {path}",
            buttons=("Export", "Cancel"), close_choice=1, title="QA Shelf Tool auth",
        ) != 0:
            return
        target = export_shelf_tool(tool.name(), tool.label(), tool.script(), folder, tool.icon())
        settings.setValue("folder", folder)
        hou.ui.displayMessage(f"Created {target}\nUpload this ZIP through New product > Tool.", title="QATools")
    except (ValueError, SyntaxError, OSError, hou.Error) as error:
        hou.ui.displayMessage(str(error), title="QATools", severity=hou.severityType.Error)
