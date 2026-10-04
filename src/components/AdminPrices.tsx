"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import "./AdminOrders.css";
type Product = { id: string | number; name: string; slug: string; published: boolean };
type Mapping = { product_id: number; price_id: string; paddle_product_id: string; enabled: boolean };
export default function AdminPrices({ products }: { products: Product[] }) {
  const [id, setId] = useState("");
  return <section className="admin-orders">
    <div className="admin-orders-heading"><div><span className="admin-orders-kicker">PAYMENTS · SANDBOX</span><h2>Tool prices</h2></div></div>
    <p className="user-muted">Connect each paid tool to its Paddle sandbox product and price. The price must match the website and include tax.</p>
    <div className="admin-orders-controls"><label>Item<select value={id} onChange={e => setId(e.target.value)}><option value="">Choose an item</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div>
    {id && <PriceEditor key={id} productId={Number(id)} />}
  </section>;
}
function PriceEditor({ productId }: { productId: number }) {
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [loaded, setLoaded] = useState(false), [price, setPrice] = useState(""), [product, setProduct] = useState("");
  const [enabled, setEnabled] = useState(true), [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null), [error, setError] = useState<string | null>(null);
  async function request(save: boolean) {
    if (busy) return;
    setBusy(true); setMessage(null); setError(null);
    try {
      const session = await supabase.auth.getSession(); if (session.error || !session.data.session) throw new Error("Please log in again.");
      const r = await fetch("/api/admin/prices", { method: save ? "POST" : "GET", cache: "no-store",
        headers: { Authorization: "Bearer " + session.data.session.access_token, "Content-Type": "application/json" },
        body: save ? JSON.stringify({ productId, priceId: price, paddleProductId: product, enabled, expectedPrice: mapping?.price_id ?? "", expectedEnabled: mapping?.enabled ?? false }) : undefined });
      const body = await r.json(); if (!r.ok) throw new Error(body.error ?? "Unable to load price.");
      if (save) { setMapping({ product_id: productId, price_id: price, paddle_product_id: product, enabled }); setMessage(body.message); }
      else { const found = (body.mappings as Mapping[]).find(m => m.product_id === productId) ?? null; setMapping(found); setPrice(found?.price_id ?? ""); setProduct(found?.paddle_product_id ?? ""); setEnabled(found?.enabled ?? true); setLoaded(true); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to manage price."); }
    finally { setBusy(false); }
  }
  return <div>
    <button type="button" disabled={busy} onClick={() => request(false)}>{loaded ? "REFRESH PRICE" : "LOAD PRICE"}</button>
    {loaded && <div className="admin-orders-controls">
      <label>Paddle product ID<input value={product} disabled={busy} onChange={e => setProduct(e.target.value)} placeholder="pro_..." /></label>
      <label>Paddle price ID<input value={price} disabled={busy} onChange={e => setPrice(e.target.value)} placeholder="pri_..." /></label>
      <label><input type="checkbox" checked={enabled} disabled={busy} onChange={e => setEnabled(e.target.checked)} /> Enabled</label>
      <button type="button" disabled={busy || !price || !product} onClick={() => request(true)}>VERIFY & SAVE</button>
    </div>}
    {error && <p role="alert" className="admin-orders-error">{error}</p>}
    {message && <p role="status">{message}</p>}
  </div>;
}
