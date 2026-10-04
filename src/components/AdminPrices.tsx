"use client";
import { useState } from "react";
import PublicationState from "@/components/PublicationState";
import { supabase } from "@/lib/supabase";
import "./AdminOrders.css";
type Product = { id: string | number; name: string; slug: string; published: boolean };
type Tool = { id: number; slug: string; price_eur: number | string; published: boolean };
type Mapping = { product_id: number; price_id: string; paddle_product_id: string; enabled: boolean };
type Setup = { status: string; paddle_product_id: string | null; price_id: string | null };
export default function AdminPrices({ products }: { products: Product[] }) {
  const [id, setId] = useState("");
  return <section className="admin-orders">
    <div className="admin-orders-heading"><div><span className="admin-orders-kicker">PAYMENTS · SANDBOX</span><h2>Tool prices</h2></div></div>
    <p className="user-muted">Choose a paid tool to set up its Paddle price using the website price, including tax.</p>
    <div className="admin-orders-controls"><label>Item<select value={id} onChange={e => setId(e.target.value)}><option value="">Choose an item</option>{products.map(p => <option className={p.published ? "publication-option-published" : "publication-option-unpublished"} key={p.id} value={p.id}>{p.name}</option>)}</select></label></div>
    {id && <PriceEditor key={id} productId={Number(id)} />}
  </section>;
}
function PriceEditor({ productId }: { productId: number }) {
  const [mapping, setMapping] = useState<Mapping | null>(null), [tool, setTool] = useState<Tool | null>(null), [setup, setSetup] = useState<Setup | null>(null);
  const [loaded, setLoaded] = useState(false), [price, setPrice] = useState(""), [product, setProduct] = useState("");
  const [enabled, setEnabled] = useState(true), [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null), [error, setError] = useState<string | null>(null);
  async function authorizedFetch(url: string, body?: object) {
    const session = await supabase.auth.getSession();
    if (session.error || !session.data.session) throw new Error("Please log in again.");
    const response = await fetch(url, { method: body ? "POST" : "GET", cache: "no-store",
      headers: { Authorization: "Bearer " + session.data.session.access_token, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Unable to manage price.");
    return data;
  }
  async function load() {
    const data = await authorizedFetch("/api/admin/prices/create?productId=" + productId);
    const found = data.mapping as Mapping | null, job = data.setup as Setup | null;
    setMapping(found); setTool(data.product); setSetup(job);
    setPrice(found?.price_id ?? job?.price_id ?? ""); setProduct(found?.paddle_product_id ?? job?.paddle_product_id ?? "");
    setEnabled(found?.enabled ?? true); setLoaded(true);
  }
  async function request(action: "load" | "save" | "create") {
    if (busy) return;
    setBusy(true); setMessage(null); setError(null);
    try {
      if (action === "load") { await load(); return; }
      if (action === "create" && !tool) return;
      const data = action === "create"
        ? await authorizedFetch("/api/admin/prices/create", { productId, expectedSlug: tool!.slug, expectedAmount: Math.round(Number(tool!.price_eur) * 100) })
        : await authorizedFetch("/api/admin/prices", { productId, priceId: price, paddleProductId: product, enabled, expectedPrice: mapping?.price_id ?? "", expectedEnabled: mapping?.enabled ?? false });
      await load(); setMessage(data.message);
    } catch (reason) {
      const text = reason instanceof Error ? reason.message : "Unable to manage price.";
      if (action === "create") { try { await load(); } catch { /* Retain the original setup error. */ } }
      setError(text);
    } finally { setBusy(false); }
  }
  const canCreate = loaded && tool?.published && Number(tool.price_eur) > 0 && !mapping && !setup;
  return <div>
    <button type="button" disabled={busy} onClick={() => request("load")}>{loaded ? "REFRESH PRICE" : "LOAD PRICE"}</button>
    {loaded && tool && <>
      <PublicationState published={tool.published} /><p>{tool.slug} · {Number(tool.price_eur).toFixed(2)} EUR including tax · One-time purchase</p>
      {mapping ? <p role="status">{mapping.enabled ? "Paddle checkout enabled." : "Paddle checkout disabled."}</p> : <>
        <button type="button" disabled={busy || !canCreate} onClick={() => request("create")}>{busy ? "PLEASE WAIT…" : "SET UP PADDLE PRICE"}</button>
        {setup && <p className="user-muted">A setup attempt is recorded. Connect the existing IDs below; check Paddle if an ID is missing.</p>}
        {!tool.published && <p className="user-muted">Publish this tool before setting up its price.</p>}
        {Number(tool.price_eur) === 0 && <p className="user-muted">Free tools do not need Paddle.</p>}
      </>}
      <details>
        <summary>Connect existing IDs or manage price</summary>
        <div className="admin-orders-controls">
          <label>Paddle product ID<input value={product} disabled={busy} onChange={e => setProduct(e.target.value)} placeholder="pro_..." /></label>
          <label>Paddle price ID<input value={price} disabled={busy} onChange={e => setPrice(e.target.value)} placeholder="pri_..." /></label>
          <label><input type="checkbox" checked={enabled} disabled={busy} onChange={e => setEnabled(e.target.checked)} /> Enabled</label>
          <button type="button" disabled={busy || !price || !product} onClick={() => request("save")}>VERIFY & SAVE</button>
        </div>
      </details>
    </>}
    {error && <p role="alert" className="admin-orders-error">{error}</p>}
    {message && <p role="status">{message}</p>}
  </div>;
}
