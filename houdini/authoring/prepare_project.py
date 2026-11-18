"""Preflight and export a saved project for QATools."""
import json
from pathlib import Path
import re
import zipfile
from .prepared_tool import atomic_export

MARKER = "qatools-preparation.json"
SLUG = re.compile(r"[a-z0-9][a-z0-9_-]{0,79}")
FRAME = re.compile(r"\$(?:\{F(\d*)\}|F(\d*)(?![A-Za-z0-9_]))|<UDIM>")
ASSET = (".hda", ".hdalc", ".hdanc", ".shelf")


def project_identity(folder):
    name = re.sub(r"^\d+[\s_-]*", "", folder.strip())
    words = re.split(r"[\s_-]+", name)
    if not all(re.fullmatch(r"[A-Za-z0-9]+", word) for word in words):
        raise ValueError("Use a project folder name such as 088_project_name.")
    title = " ".join(word.capitalize() for word in words)
    if len(title) > 80:
        raise ValueError("The project title can contain at most 80 characters.")
    return title, title.lower().replace(" ", "_")


def inspect_nodes(hou, factory):
    tools, warnings, errors = {}, {}, []
    nodes = list(hou.node("/").children())
    while nodes:
        node = nodes.pop()
        kind = node.type()
        definition = getattr(kind, "definition", lambda: None)()
        if definition is not None:
            # Match the asset type and library, independent of the instance name.
            type_parts = definition.nodeTypeName().split("::")
            source_stem = Path(definition.libraryFilePath()).stem
            if any(part.casefold().endswith("_dev") for part in [*type_parts, source_stem]):
                errors.append("Development HDA at " + node.path()
                    + ". Replace it with the release exported by QA HDA auth before exporting the project.")
                continue
        marker = definition.sections().get(MARKER) if definition else None
        if marker is not None:
            try:
                value = json.loads(marker.contents())
                slug = value["slug"]
                if type(value["schema"]) is not int or value["schema"] != 1 or not isinstance(slug, str) or not SLUG.fullmatch(slug):
                    raise ValueError("Invalid QATools identity")
                tools.setdefault(slug, []).append(node.path())
            except (ValueError, TypeError, KeyError, hou.Error):
                errors.append("Invalid QATools identity at " + node.path())
            continue  # The prepared asset's own installer supplies its contents.
        source = definition.libraryFilePath() if definition else getattr(kind, "sourcePath", lambda: "")()
        path = Path(source)
        internal = source == "Internal" or (path.is_absolute() and path.resolve().is_relative_to(factory))
        if kind.name() == "missing" or (path.is_absolute() and not path.is_file()):
            errors.append("Missing node definition at " + node.path())
        if not internal:
            name = kind.category().name() + "/" + kind.name()
            warnings[name] = min(warnings.get(name, node.path()), node.path())
        try:
            nodes.extend(node.children())
        except hou.PermissionError:
            if internal:
                errors.append("Cannot inspect " + node.path())
    return tools, warnings, errors


def safe_name(path):
    for part in path.parts:
        if (part in (".", "..") or part.endswith((" ", ".")) or
                re.search(r'[<>:"|?*\x00-\x1f]', part) or
                re.match(r"(?i)(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)", part) or
                re.match(r"(?i)(?:\.env(?:\.|$)|qatools(?:\.json)?$|qatools_licensing$)", part) or
                re.fullmatch(r"(?i)(?:account-v2\.json|license\.txt|.*private.*\.(?:pem|key))", part)):
            raise ValueError("Unsupported project path " + path.as_posix())
    if path.suffix.lower() in ASSET:
        raise ValueError("Install separately: " + path.as_posix())


def resource_files(relative, root):
    parent = (root / relative.parent).resolve()
    if relative.is_absolute() or not parent.is_relative_to(root) or "$" in str(relative.parent):
        raise ValueError("Use a fixed directory under $HIP.")
    name = relative.name
    if FRAME.search(name):
        pieces, cursor = [], 0
        for token in FRAME.finditer(name):
            pieces.append(re.escape(name[cursor:token.start()]))
            digits = token[1] or token[2]
            if digits and int(digits) > 12:
                raise ValueError("Unsupported frame padding.")
            pieces.append(r"\d{4}" if token[0] == "<UDIM>" else r"-?\d{" + (digits or "1") + ",}")
            cursor = token.end()
        pieces.append(re.escape(name[cursor:]))
        pattern = re.compile("".join(pieces))
        return [file for file in parent.iterdir() if pattern.fullmatch(file.name) and file.is_file()]
    if any(char in name for char in ("$", chr(96), "<", ">")):
        raise ValueError("Resolve the dynamic file reference.")
    return [parent / name]


def find_resources(hou, root, factory, tool_paths):
    resources, errors = {}, []
    for parm, reference in hou.fileReferences():
        if parm is not None:
            location = parm.path()
            if any(location.startswith(path + "/") and "/" in location[len(path)+1:] for path in tool_paths):
                continue
            try:
                if parm.parmTemplate().tags().get("filechooser_mode") == "write":
                    continue
                reference = parm.unexpandedString()
            except hou.Error:
                errors.append("Review the expression at " + location)
                continue
        else:
            location = reference
        if not reference or reference.startswith(("op:", "opdef:", "oplib:", "temp:")):
            continue
        expanded = Path(hou.expandString(reference))
        if expanded.suffix.lower() in ASSET or (expanded.is_absolute() and expanded.resolve().is_relative_to(factory)):
            continue  # Node libraries and factory resources come from their own installers.
        match = re.fullmatch(r"(?:\$HIP|\$\{HIP\})[/\\](.+)", reference)
        if not match:
            errors.append(location + ": use a path relative to $HIP")
            continue
        relative = Path(match[1].replace("\\", "/"))
        try:
            files = resource_files(relative, root)
            if not files:
                raise ValueError("No matching files found.")
            for file in files:
                name = relative.parent / file.name
                safe_name(name)
                if not file.is_file() or not file.resolve().is_relative_to(root):
                    raise ValueError("Missing file or file outside the project folder.")
                resources[name.as_posix()] = file
        except (ValueError, OSError) as error:
            errors.append(f"{location}: {error}")
    return resources, sorted(set(errors))


def export_project(scene, resources, tools, warnings, version, folder):
    title, slug = project_identity(scene.parent.name)
    safe_name(Path(scene.name))
    safe_name(Path(title))
    manifest = {
        "schema": 1, "label": title, "slug": slug, "scene": scene.name,
        "houdini": version, "tools": sorted(tools),
        "warnings": [{"type": name, "node": warnings[name]} for name in sorted(warnings)],
    }
    data = json.dumps(manifest, ensure_ascii=True).encode()
    readme = "\n".join([title, f"Open {scene.name} in Houdini {version}. Keep the project files together.",
        f"The website download places these files in Project/{title}/.",
        *(["", "Additional tools may require a separate installation:", *sorted(warnings)] if warnings else [])]).encode()
    files = {**resources, scene.name: scene}
    if len(scene.name) > 255 or any(len(name) > 256 or len(path) > 512 for name, path in warnings.items()):
        raise ValueError("A scene or dependency name is too long for the website.")
    names = [*files, "qatools-project.json", "QATools Project README.txt"]
    if any(len(("Project/" + title + "/" + name).encode("utf-8")) > 512 for name in names):
        raise ValueError("Shorten the project file paths to fit the downloadable package.")
    if len(names) > 1000 or len({name.casefold() for name in names}) != len(names):
        raise ValueError("Too many files or a duplicate project filename.")
    if len(tools) > 100 or len(warnings) > 200 or len(data) > 65536:
        raise ValueError("The project has too many tool dependencies.")
    if sum(path.stat().st_size for path in files.values()) + len(data) + len(readme) > 20 * 1024 * 1024:
        raise ValueError("Project files exceed the website's 20 MB uncompressed limit.")
    target = Path(folder) / (slug + ".zip")
    with atomic_export(target) as output:
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("qatools-project.json", data)
            archive.writestr("QATools Project README.txt", readme)
            for name, path in sorted(files.items()):
                archive.write(path, name)
        if output.tell() > 4 * 1024 * 1024 - 8192:
            raise ValueError("The project ZIP exceeds the website's 4 MB upload limit.")
    return target


def shelf_action():
    import hou
    from PySide6 import QtCore, QtWidgets
    try:
        scene = Path(hou.hipFile.path()).resolve()
        if hou.hipFile.isNewFile() or hou.hipFile.hasUnsavedChanges() or not scene.is_file() or scene.suffix.lower() not in (".hip", ".hiplc", ".hipnc"):
            raise ValueError("Save the project scene before exporting.")
        title, slug = project_identity(scene.parent.name)
        version = hou.applicationVersionString()
        factory = Path(hou.expandString("$HFS")).resolve()
        tools, warnings, errors = inspect_nodes(hou, factory)
        paths = [path for instances in tools.values() for path in instances]
        resources, unresolved = find_resources(hou, scene.parent, factory, paths)
        if errors or unresolved:
            hou.ui.displayMessage("Fix the missing or non-portable references before exporting.",
                details="\n".join(errors + unresolved), severity=hou.severityType.Error, title="QA Project auth")
            return
        details = ["QATools:"] + [f"{key}: {', '.join(sorted(locations))}" for key, locations in sorted(tools.items())]
        if warnings:
            details.extend(["", "Warning: other tools may require separate installation:"])
            details.extend(f"{name}: {path}" for name, path in sorted(warnings.items()))
        details.extend(["", "Files:", scene.name, *sorted(resources)])
        choice, manual = hou.ui.readInput(
            "Optional extra QATools product slugs, separated by commas.",
            buttons=("Continue", "Cancel"), close_choice=1, title="QA Project auth",
        )
        if choice != 0:
            return
        for extra in filter(None, (value.strip() for value in manual.split(","))):
            if not SLUG.fullmatch(extra):
                raise ValueError("Invalid QATools slug: " + extra)
            tools.setdefault(extra, [])
        if manual.strip():
            details.append("\nAdditional QATools: " + manual)
        settings = QtCore.QSettings("QATools", "PrepareProject")
        folder = QtWidgets.QFileDialog.getExistingDirectory(
            hou.qt.mainWindow(), "Export " + slug + ".zip", settings.value("folder", str(scene.parent)),
        )
        if not folder:
            return
        target = Path(folder) / (slug + ".zip")
        if hou.ui.displayMessage(
            f"{title}\nSlug: {slug}\nHoudini: {version}\nZIP: {target}"
            + ("\nReview additional tools before publishing." if warnings else ""),
            details="\n".join(details), buttons=("Export", "Cancel"), close_choice=1,
            severity=hou.severityType.Warning if warnings else hou.severityType.Message, title="QA Project auth",
        ) != 0:
            return
        export_project(scene, resources, tools, warnings, version, folder)
        settings.setValue("folder", folder)
        hou.ui.displayMessage(f"Created {target}\nUpload through New product > Project.\nThe customer download contains Project/{title}/.", title="QA Project auth")
    except (ValueError, OSError, hou.Error, zipfile.LargeZipFile) as error:
        hou.ui.displayMessage(str(error), title="QA Project auth", severity=hou.severityType.Error)
