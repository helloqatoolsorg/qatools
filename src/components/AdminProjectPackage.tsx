"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { ProjectInspection, ProjectManifest } from "@/lib/projectArchive";
import {inspectProjectFile} from "@/lib/projectUpload";

async function token() {
  const { data, error } = await supabase.auth.getSession();
  if (!data.session || error) throw new Error("Please log in again.");
  return data.session.access_token;
}

type Download = { file_path: string; file_name: string };
export type ProjectPackageProps = {
  productId: number | null;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  tool: File | null;
  onToolChange: (file: File | null) => void;
  ensureDraft: () => Promise<number>;
  projectInspection?: ProjectInspection | null;
  onProjectInspection?: (inspection: ProjectInspection) => void;
};

export default function AdminProjectPackage({
  productId, disabled, onBusyChange, tool, onToolChange, onProjectInspection, projectInspection,
}: ProjectPackageProps) {
  const [download, setDownload] = useState<Download | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storedManifest, setStoredManifest] = useState<ProjectManifest | null>(null);
  const manifest = tool ? projectInspection?.manifest : storedManifest;
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!productId) return;
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch("/api/admin/downloads?productId=" + productId, {
          cache: "no-store", headers: { Authorization: "Bearer " + await token() }, signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Unable to load installer.");
        const details = await fetch("/api/admin/products/project-inspect?productId=" + productId, {
          cache: "no-store", headers: {Authorization: "Bearer " + await token()}, signal: controller.signal,
        });
        const saved = await details.json();
        if (!details.ok) throw new Error(saved.error ?? "Unable to load project details.");
        if (!controller.signal.aborted) {setDownload(body.download); setStoredManifest(saved.manifest); setLoaded(true);}
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to load installer.");
      }
    })();
    return () => controller.abort();
  }, [productId, revision]);

  async function choose(file: File) {
    setBusy(true);
    onBusyChange(true);
    onToolChange(null);
    setError(null);
    try {
      const result = await inspectProjectFile(file);
      onProjectInspection?.(result);
      onToolChange(file);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to inspect project ZIP.");
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  return <section className="admin-tool-package">
    <h2>Project files</h2>
    <p>Choose a ZIP from QA Project auth. Its title and included tools are filled automatically. Click Update product to save and build the download with its files under Project / Project Name.</p>
    <fieldset disabled={disabled || busy}>
      <label>Upload project ZIP<input type="file" accept=".zip" onChange={event => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) void choose(file);
      }} /></label>
      {tool && <p>Selected: {tool.name} <button type="button" onClick={() => { onToolChange(null); setError(null); }}>Remove</button></p>}

    </fieldset>
    {busy && <p role="status">Preparing project files…</p>}
    {download && <p>Current installer: {download.file_name}</p>}
    {manifest?.warnings.length ? <div role="status">
      <p>These dependencies may need a separate installation.</p>
      <ul>{manifest.warnings.map(warning => <li key={warning.type + ":" + warning.node}>{warning.type} ({warning.node})</li>)}</ul>
    </div> : null}
    {error && <p role="alert" className="admin-product-error">{error} {productId && !loaded &&
      <button type="button" disabled={busy} onClick={() => { setError(null); setRevision(value => value + 1); }}>Retry loading installer</button>}</p>}

  </section>;
}
