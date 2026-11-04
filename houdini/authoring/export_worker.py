"""Export in headless Houdini; never install transient assets in the UI session."""
import importlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time


def run_job(job_path):
    import hou
    if hou.isUIAvailable():
        raise RuntimeError("Export worker must run headlessly.")
    job = json.loads(Path(job_path).read_text(encoding="utf-8"))
    loaded = {os.path.normcase(os.path.abspath(p)) for p in hou.hda.loadedFiles()}
    for library in job["libraries"]:
        if os.path.normcase(os.path.abspath(library)) not in loaded:
            hou.hda.installFile(library, change_oplibraries_file=False)
    hou.hda.installFile(job["source"], change_oplibraries_file=False)
    definition = next(d for d in hou.hda.definitionsInFile(job["source"]) if d.nodeTypeName() == job["type"])
    definition.setIsPreferred(True)
    geo = hou.node("/obj").createNode("geo", run_init_scripts=False)
    node = geo.createNode(job["type"])
    from .prepare_tool import prepare
    result = prepare(node, job["output"], icon_path=job["icon"])
    Path(job["result"]).write_text(json.dumps(result), encoding="utf-8")


def prepare_isolated(node, destination, icon_path=None):
    import hou
    from .prepared_tool import release_names, atomic_export
    from .prepare_tool import MARKER, qt_bindings, expand_string
    QtCore, QtWidgets = qt_bindings()
    definition = node.type().definition()
    if definition is None or not node.matchesCurrentDefinition():
        raise ValueError("Save and lock the source HDA before exporting.")
    if MARKER in definition.sections():
        raise ValueError("Export from the original development HDA, not a prepared release.")
    _, internal = release_names(definition.nodeTypeName())
    source = Path(definition.libraryFilePath()).resolve()
    if source.name != definition.nodeTypeName() + ".hdalc":
        raise ValueError("Save the source as " + definition.nodeTypeName() + ".hdalc.")
    target = Path(destination).resolve().parent / (internal + ".zip")
    executable = Path(expand_string("$HFS")) / "bin" / ("hython.exe" if os.name == "nt" else "hython")
    if not executable.is_file():
        raise ValueError("Cannot find hython in this Houdini installation.")
    with tempfile.TemporaryDirectory(prefix="qatools-headless-") as directory:
        root = Path(directory)
        snapshot = root / source.name
        # Raw filesystem copy emits no HDA events in the working Houdini session.
        shutil.copyfile(source, snapshot)
        if icon_path:
            icon = root / "node-icon.png"
            shutil.copyfile(icon_path, icon)
        else:
            icon = None
        output = root / (internal + ".zip")
        result_path = root / "result.json"
        job_path = root / "job.json"
        libraries = [p for p in hou.hda.loadedFiles() if Path(p).is_file() and Path(p).resolve() != source]
        job_path.write_text(json.dumps({"source":str(snapshot),"type":definition.nodeTypeName(),
            "libraries":libraries,"output":str(output),"icon":str(icon) if icon else None,"result":str(result_path)}), encoding="utf-8")
        package_root = str(Path(__file__).resolve().parent.parent)
        command = "import sys,importlib;sys.path.insert(0,sys.argv[1]);importlib.import_module(sys.argv[2]).run_job(sys.argv[3])"
        progress = QtWidgets.QProgressDialog("Preparing black-box export in headless Houdini…", "", 0, 0, hou.qt.mainWindow())
        progress.setCancelButton(None)
        progress.setWindowModality(QtCore.Qt.WindowModality.ApplicationModal)
        progress.setMinimumDuration(0)
        progress.show()
        process = None
        try:
            with (root / "worker.log").open("wb") as log:
                process = subprocess.Popen([str(executable),"-c",command,package_root,__name__,str(job_path)],
                    stdout=log,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,"CREATE_NO_WINDOW",0))
                started = time.monotonic()
                while process.poll() is None:
                    QtWidgets.QApplication.processEvents()
                    if time.monotonic() - started > 300:
                        raise ValueError("Headless export timed out. No release ZIP was installed.")
                    time.sleep(0.05)
            if process.returncode != 0 or not result_path.exists() or not output.is_file():
                detail = (root / "worker.log").read_text(encoding="utf-8", errors="replace")[-5000:]
                raise ValueError("Headless export failed. Your source is unchanged.\n" + detail)
            result = json.loads(result_path.read_text(encoding="utf-8"))
            target.parent.mkdir(parents=True, exist_ok=True)
            with atomic_export(target) as exported, output.open("rb") as prepared:
                shutil.copyfileobj(prepared, exported)
            return result
        finally:
            if process is not None and process.poll() is None:
                process.kill()
                process.wait()
            progress.close()
