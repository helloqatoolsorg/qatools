"""Synthetic local-only Houdini black-box comparison; no customer assets or server calls."""
import json
import tempfile
from pathlib import Path
import hou

def inspect(node):
    result = {"compiled": node.isCompiled(), "locked": node.isLockedHDA()}
    try:
        result["children"] = [n.name() for n in node.children()]
    except hou.PermissionError:
        result["children"] = "permission denied"
    try:
        probe = node.createNode("null", "edit_probe")
        result["create_node"] = "allowed"
        probe.destroy()
    except hou.Error as error:
        result["create_node"] = type(error).__name__
    return result

print("Houdini:", hou.applicationVersionString(), "License:", str(hou.licenseCategory()))
with tempfile.TemporaryDirectory(prefix="qatools-blackbox-diagnostic-") as folder:
    for index, mode in enumerate(("ordinary", "black_default", "black_explicit_lock")):
        libraries = []
        geo = hou.node("/obj").createNode("geo", run_init_scripts=False)
        try:
            source = str(Path(folder) / (mode + "_source.hdalc"))
            target = str(Path(folder) / (mode + ".hdalc"))
            subnet = geo.createNode("subnet")
            output = subnet.createNode("null", "original_contents")
            output.setDisplayFlag(True)
            output.setRenderFlag(True)
            name = "qatools_blackbox_diagnostic_" + str(index)
            asset = subnet.createDigitalAsset(name=name, hda_file_name=source)
            libraries.append(source)
            asset.allowEditingOfContents()
            definition = asset.type().definition()
            options = hou.HDAOptions()
            options.setLockContents(True)
            definition.save(target, template_node=asset, black_box=mode != "ordinary",
                            options=options if mode == "black_explicit_lock" else None,
                            create_backup=False)
            asset.destroy()
            hou.hda.uninstallFile(source)
            libraries.remove(source)
            hou.hda.installFile(target, change_oplibraries_file=False)
            libraries.append(target)
            instance = geo.createNode(name)
            report = {"mode": mode, "before_unlock": inspect(instance)}
            try:
                instance.allowEditingOfContents()
                report["unlock"] = "returned"
            except hou.Error as error:
                report["unlock"] = type(error).__name__
            report["after_unlock"] = inspect(instance)
            print(json.dumps(report))
        except Exception as error:
            print(json.dumps({"mode": mode, "error": str(error)}))
        finally:
            geo.destroy()
            for library in libraries:
                hou.hda.uninstallFile(library)
