"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { logoUrl, useSiteBranding } from "@/context/SiteBranding";
type Branding = { logo_path: string | null; revision: string };
async function logoToken() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Please log in again.");
  return data.session.access_token;
}
async function fetchLogo(signal?: AbortSignal): Promise<Branding> {
  const response = await fetch("/api/admin/site-logo", { headers: { Authorization: `Bearer ${await logoToken()}` }, cache: "no-store", signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Unable to load the logo.");
  return result;
}
export default function AdminSiteLogo() {
  const { refresh } = useSiteBranding();
  const [saved, setSaved] = useState<Branding | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const inFlight = useRef(false);
  async function load() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try { setSaved(await fetchLogo()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load the logo."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  useEffect(() => {
    const controller = new AbortController();
    fetchLogo(controller.signal).then(result => {
      if (!controller.signal.aborted) setSaved(result);
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to load the logo.");
    }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview); };
  }, [preview]);
  async function update(restore: boolean) {
    if (inFlight.current || !saved || (!restore && !file)) return;
    if (restore && !window.confirm("Restore the default website logo?")) return;
    inFlight.current = true; setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch("/api/admin/site-logo" + (restore ? "" : `?revision=${saved.revision}`), {
        method: restore ? "DELETE" : "POST", cache: "no-store",
        headers: { Authorization: `Bearer ${await logoToken()}`, "Content-Type": restore ? "application/json" : "application/octet-stream" },
        body: restore ? JSON.stringify({ revision: saved.revision }) : file,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to save the logo.");
      setSaved(result); setFile(null); setPreview(null); refresh();
      setMessage(restore ? "Default logo restored." : "Website logo updated.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save the logo."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <section className="admin-site-logo" aria-labelledby="website-logo-title">
    <h2 id="website-logo-title">Website logo</h2>
    <p className="user-muted">PNG or WebP · up to 2 MB. Preview first, then update.</p>
    <div className="admin-logo-preview"><Image src={preview ?? logoUrl(saved?.logo_path ?? null)} alt={file ? "New logo preview" : "Current website logo"} width={145} height={54} unoptimized /></div>
    <label className="admin-logo-upload">Choose logo<input type="file" accept="image/png,image/webp" disabled={busy || !saved} onChange={event => {
      const chosen = event.target.files?.[0]; event.target.value = ""; setMessage(null); setError(null);
      if (!chosen) return;
      if (!["image/png", "image/webp"].includes(chosen.type) || chosen.size > 2 * 1024 * 1024) { setError("Choose a PNG or WebP up to 2 MB."); return; }
      setFile(chosen); setPreview(URL.createObjectURL(chosen));
    }} /></label>
    <div className="admin-logo-actions">
      <button type="button" disabled={busy || !saved || !file} onClick={() => update(false)}>{busy ? "Please wait…" : "Update logo"}</button>
      {file && <button type="button" disabled={busy} onClick={() => { setFile(null); setPreview(null); setError(null); }}>Discard preview</button>}
      <button type="button" disabled={busy || !saved || !saved.logo_path} onClick={() => update(true)}>Restore default</button>
    </div>
    {error && <div role="alert"><p className="password-error">{error}</p><button type="button" disabled={busy} onClick={load}>Reload logo</button></div>}
    {message && <p role="status" className="password-success">{message}</p>}
  </section>;
}
