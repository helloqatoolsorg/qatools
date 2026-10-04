"use client";
import { useEffect, useState } from "react";
import PublicationState from "@/components/PublicationState";
import { supabase } from "@/lib/supabase";
import "./AdminOrders.css";
import "./AdminDownloads.css";

type Product = { id: string | number; name: string; slug: string; published: boolean };
type Download = { product_id: number; file_path: string; file_name: string; enabled: boolean };
async function token() {
  const result = await supabase.auth.getSession();
  if (result.error || !result.data.session) throw new Error("Please log in again.");
  return result.data.session.access_token;
}
export default function AdminDownloads({ products }: { products: Product[] }) {
  const [id, setId] = useState("");
  const [download, setDownload] = useState<Download | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setDownload(null); setLoaded(false); setFile(null); setError(null);
    if (!id) return;
    (async () => {
      try {
        const response = await fetch(`/api/admin/downloads?productId=${id}`, { cache: "no-store", headers: { Authorization: "Bearer " + await token() } });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to load download.");
        if (!cancelled) { setDownload(result.download); setLoaded(true); }
      } catch (reason) { if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to load download."); }
    })();
    return () => { cancelled = true; };
  }, [id, revision]);
  async function save(upload: boolean) {
    if (busy || !id || !loaded || (upload && !file) || (!upload && !download)) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const accessToken = await token();
      const query = new URLSearchParams({ productId: id, expectedPath: download?.file_path ?? "" });
      if (upload && file) query.set("fileName", file.name);
      const response = await fetch(`/api/admin/downloads${upload ? "?" + query : ""}`, {
        method: upload ? "POST" : "PATCH", cache: "no-store",
        headers: { Authorization: "Bearer " + accessToken, "Content-Type": upload ? "application/zip" : "application/json" },
        body: upload ? file : JSON.stringify({ productId: Number(id), expectedPath: download?.file_path, enabled: !download?.enabled }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to save download.");
      setMessage(result.message); setRevision(value => value + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save download."); }
    finally { setBusy(false); }
  }
  return <section className="admin-orders admin-downloads">
    <div className="admin-orders-heading"><div><span className="admin-orders-kicker">DELIVERY</span><h2>Tool downloads</h2></div></div>
    <div className="admin-orders-controls">
      <label>Item<select value={id} disabled={busy} onChange={event => { setId(event.target.value); setLoaded(false); setDownload(null); setFile(null); setMessage(null); }}><option value="">Choose an item</option>{products.map(product => <option className={product.published ? "publication-option-published" : "publication-option-unpublished"} key={product.id} value={product.id}>{product.name}{product.published ? "" : " (unpublished)"}</option>)}</select></label>
      <button type="button" disabled={!id || busy} onClick={() => setRevision(value => value + 1)}>REFRESH</button>
    </div>
    {id && <div className="admin-download-details">
      <PublicationState published={products.find(p => String(p.id) === id)?.published ?? false} />
      <p>{!loaded ? (error ? "Download unavailable." : "Loading download...") : download ? `${download.file_name} · ${download.enabled ? "ENABLED" : "DISABLED"}` : "No package uploaded yet."}</p>
      {download && <button type="button" disabled={busy || !loaded} onClick={() => save(false)}>{download.enabled ? "DISABLE DOWNLOAD" : "ENABLE DOWNLOAD"}</button>}
      <label className="admin-download-file">ZIP package<input key={`${id}-${revision}`} type="file" accept=".zip" disabled={busy || !loaded} onChange={event => {
        const selected = event.target.files?.[0] ?? null; setFile(null); setMessage(null);
        if (selected && (selected.size > 25 * 1024 * 1024 || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.zip$/i.test(selected.name) || selected.name.length > 128)) setError("Choose a ZIP up to 25 MB with a simple filename (letters, numbers, dots, underscores or hyphens).");
        else { setFile(selected); setError(null); }
      }} /></label>
      <p>Upload a ZIP up to 25 MB. Uploading enables this package for existing owners. Keep account keys, private signing keys and server configuration out of the package.</p>
      <button type="button" disabled={busy || !loaded || !file} onClick={() => save(true)}>{busy ? "SAVING..." : download ? "UPLOAD REPLACEMENT" : "UPLOAD & ENABLE"}</button>
    </div>}
    {error && <p role="alert" className="admin-orders-error">{error}</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
