"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
async function token() { const result = await supabase.auth.getSession(); if (!result.data.session || result.error) throw new Error("Please log in again."); return result.data.session.access_token; }
type Download = { file_path: string; file_name: string; enabled: boolean };
export default function AdminToolPackage({ productId, disabled, onBusyChange, tool, onToolChange, ensureDraft, kind="tool", prepared=false }: { prepared?:boolean; kind?:"tool"|"bundle"|"project"; productId:number|null; disabled:boolean; onBusyChange:(busy:boolean)=>void; tool:File|null; onToolChange:(file:File|null)=>void; ensureDraft:()=>Promise<number> }) {
  const [download, setDownload] = useState<Download | null>(null), [loaded,setLoaded] = useState(false);
  const [busy,setBusy] = useState(false), [error,setError] = useState<string | null>(null), [message,setMessage] = useState<string | null>(null);
  const [revision,setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    if (!productId) return;
    (async () => { try {
      const response = await fetch("/api/admin/downloads?productId=" + productId,{cache:"no-store",headers:{Authorization:"Bearer " + await token()}});
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Unable to load installer.");
      if (!cancelled) { setDownload(body.download); setLoaded(true); setError(null); }
    } catch (reason) { if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to load installer."); } })();
    return () => { cancelled = true; };
  },[productId,revision]);
  async function upload() {
    if ((kind!=="bundle" && !tool) || busy || disabled || (productId && !loaded)) return;
    setBusy(true); onBusyChange(true); setError(null); setMessage(null);
    try {
      if (tool && tool.size > 4 * 1024 * 1024 - 8192) throw new Error("Choose installer files totaling less than 4 MB.");
      if(tool && ((prepared || kind==="project") ? !/\.zip$/i.test(tool.name) : !/\.hda(lc|nc)?$/i.test(tool.name)))throw new Error(kind==="project" ? "Choose a project ZIP containing a Houdini scene." : prepared ? "Choose a prepared tool ZIP." : kind==="bundle" ? "Choose a bundle ZIP." : "Choose a Houdini HDA, HDALC or HDANC file.");
      const targetId=await ensureDraft();
      let expectedPath=download?.file_path ?? "";
      if(!productId){const current=await fetch("/api/admin/downloads?productId="+targetId,{cache:"no-store",headers:{Authorization:"Bearer "+await token()}});const result=await current.json();if(!current.ok)throw new Error(result.error ?? "Unable to verify installer.");expectedPath=result.download?.file_path ?? "";}
      const body = new FormData(); if(tool)body.set("tool",tool);
      const params = new URLSearchParams({productId:String(targetId),expectedPath});
      const response = await fetch("/api/admin/products/"+(kind!=="tool" ? "assemble" : "package")+"?" + params,{method:"POST",headers:{Authorization:"Bearer " + await token()},...(kind==="bundle" ? {} : {body})});
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Unable to save installer.");
      setDownload(result.download); onToolChange(null); setMessage(result.message); setRevision(v=>v+1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save installer."); }
    finally { setBusy(false); onBusyChange(false); }
  }
  return <section className="admin-tool-package"><h2>{kind==="project" ? "Project files" : "Tool files"}</h2><p>{!productId && kind!=="bundle" && "Choose a file now; save the unpublished draft before uploading. "}{kind==="project" ? "Upload a project ZIP containing your Houdini scene and its resources (smaller than 4 MB, up to 20 MB uncompressed). Do not include tool HDAs or the qatools runtime: the selected published tools are added automatically. The download keeps your project ZIP under project/, alongside the shared installer. Re-upload the ZIP to rebuild." : kind==="bundle" ? "Select the included tools, then build the installer from their uploaded files. Click Update product to save changes before building. Each tool must be published with an enabled installer. Rebuild explicitly to include later tool updates." : "The installer includes one qatools.json, your HDA and the shared qatools licensing files."}</p>
    <fieldset disabled={disabled || busy}>
      {kind!=="bundle" && <label>{kind==="project" ? "Upload project ZIP" : prepared ? "Replace prepared tool ZIP" : "Upload Houdini tool"}<input key={revision} type="file" accept={prepared || kind==="project" ? ".zip" : ".hda,.hdalc,.hdanc"} onChange={e => { onToolChange(e.target.files?.[0] ?? null); setMessage(null); }} /></label>}
      {tool && <p>Selected: {tool.name} <button type="button" onClick={()=>onToolChange(null)}>Remove</button></p>}
      <p>qatools.json · included automatically</p>
      <p><a href="/qatools.json" download="qatools.json">Download standard qatools.json</a> · Use the portable package configuration.</p>
      <button type="button" disabled={(kind!=="bundle" && !tool) || (!!productId && !loaded)} onClick={upload}>{busy ? "Preparing installer..." : kind==="project" ? download ? "Rebuild project download" : "Build project download" : kind==="bundle" ? download ? "Rebuild bundle installer" : "Build bundle installer" : download ? "Replace installer" : "Upload & prepare installer"}</button>
    </fieldset>
    {download && <p>Current installer: {download.file_name} · {download.enabled ? "enabled" : "disabled"}</p>}
    {error && <p role="alert" className="admin-product-error">{error} <button type="button" disabled={busy} onClick={() => { setLoaded(false); setRevision(v => v+1); }}>Reload</button></p>}{message && <p role="status">{message}</p>}
  </section>;
}
