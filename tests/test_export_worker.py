"""Real child-process export, run with hython; source library is never modified."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import hou


class WorkerTests(unittest.TestCase):
    def test_export_in_separate_headless_process(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "QA_Worker_A_dev.hdalc"
            geo = hou.node("/obj").createNode("geo", run_init_scripts=False)
            try:
                subnet = geo.createNode("subnet")
                output = subnet.createNode("null")
                output.setDisplayFlag(True)
                output.setRenderFlag(True)
                subnet.createDigitalAsset(name="QA_Worker_A_dev", hda_file_name=str(source), description="QA Worker A dev")
                original = source.read_bytes()
                before = hou.hda.eventCallbacks()
                job = root / "job.json"
                result = root / "result.json"
                job.write_text(json.dumps({"source":str(source),"type":"QA_Worker_A_dev","libraries":[],
                    "output":str(root / "ignored.zip"),"icon":None,"result":str(result)}), encoding="utf-8")
                package_root = str(Path(__file__).resolve().parents[1] / "houdini")
                executable = str(Path(hou.text.expandString("$HFS")) / "bin" / ("hython.exe" if os.name == "nt" else "hython"))
                command = "import sys;sys.path.insert(0,sys.argv[1]);from authoring.export_worker import run_job;run_job(sys.argv[2])"
                child = subprocess.run([executable,"-c",command,package_root,str(job)],capture_output=True,text=True,timeout=120,
                    creationflags=getattr(subprocess,"CREATE_NO_WINDOW",0))
                self.assertEqual(child.returncode,0,child.stdout + child.stderr)
                self.assertEqual(json.loads(result.read_text())["internal_name"],"QA_Worker_A")
                self.assertTrue((root / "QA_Worker_A.zip").is_file())
                self.assertEqual(source.read_bytes(), original)
                self.assertEqual(hou.hda.eventCallbacks(), before)
            finally:
                geo.destroy()
                hou.hda.uninstallFile(str(source), change_oplibraries_file=False)
