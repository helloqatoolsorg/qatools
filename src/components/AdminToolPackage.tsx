"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
async function token() { const result = await supabase.auth.getSession(); if (!result.data.session || result.error) throw new Error("Please log in again."); return result.data.session.access_token; }
type Download = { file_path: string; file_name: string; enabled: boolean };
export default function AdminToolPackage({ productId, disabled, onBusyChange }: { productId: number | null; disabled: boolean; onBusyChange: (busy: boolean) => void }) {
  const [tool, setTool] = useState<File | null>(null);
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
    if (!tool || !productId || !loaded || busy || disabled) return;
    setBusy(true); onBusyChange(true); setError(null); setMessage(null);
    try {
      if (tool.size > 4 * 1024 * 1024 - 8192) throw new Error("Choose installer files totaling less than 4 MB.");
      const body = new FormData(); body.set("tool",tool);
      const params = new URLSearchParams({productId:String(productId),expectedPath:download?.file_path ?? ""});
      const response = await fetch("/api/admin/products/package?" + params,{method:"POST",headers:{Authorization:"Bearer " + await token()},body});
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Unable to save installer.");
      setDownload(result.download); setTool(null); setMessage(result.message); setRevision(v=>v+1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save installer."); }
    finally { setBusy(false); onBusyChange(false); }
  }
  return <section className="admin-tool-package"><h2>Tool files</h2><p>{!productId && "Save the draft first. "}The installer includes one qatools.json, your HDA and the shared qatools licensing files.</p>
    <fieldset disabled={disabled || !productId || busy || !loaded}>
      <label>Upload Houdini tool<input key={revision} type="file" accept=".hda,.hdalc,.hdanc" onChange={e => { setTool(e.target.files?.[0] ?? null); setMessage(null); }} /></label>
      <p>qatools.json · included automatically</p>
      <p><a href="/qatools.json" download="qatools.json">Download standard qatools.json</a> · Use the portable package configuration.</p>
      <button type="button" disabled={!tool} onClick={upload}>{busy ? "Preparing installer..." : download ? "Replace installer" : "Upload & prepare installer"}</button>
    </fieldset>
    {download && <p>Current installer: {download.file_name} · {download.enabled ? "enabled" : "disabled"}</p>}
    {error && <p role="alert" className="admin-product-error">{error} <button type="button" disabled={busy} onClick={() => { setLoaded(false); setRevision(v => v+1); }}>Reload</button></p>}{message && <p role="status">{message}</p>}
  </section>;
}
