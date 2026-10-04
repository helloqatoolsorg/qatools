"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { productTypes, type DraftInput, type ProductType } from "@/lib/productDraft";
import "./AdminProducts.css";
type Media = { id: number; file_path: string | null; role: string; sort_order: number };
type Product = DraftInput & { id: number; slug: string; published: boolean; updated_at: string; product_media: Media[] };
type Lookup = { id: number; name: string; active: boolean };
type Catalog = { products: Product[]; categories: Lookup[]; complexities: Lookup[] };
async function access() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error("Please log in again.");
  return data.session.access_token;
}
function mediaUrl(p: Media) { return p.file_path ? supabase.storage.from("product-media").getPublicUrl(p.file_path).data.publicUrl : null; }
function artwork(p: Product) { const sorted = [...p.product_media].sort((a,b) => a.sort_order-b.sort_order); const m = sorted.find(v => v.role === "card") ?? sorted[0]; return m ? mediaUrl(m) : null; }
export default function AdminProducts({ editor = false }: { editor?: boolean }) {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id;
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [id, setId] = useState<number | null>(null);
  const [draft, setDraft] = useState<DraftInput | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [pendingTools, setPendingTools] = useState<number[]>([]);
  const [stateFilter, setStateFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const requestId = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!userId) return;
    (async () => {
      try {
        const response = await fetch("/api/admin/products", { cache: "no-store", headers: { Authorization: "Bearer " + await access() } });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Unable to load products.");
        if (cancelled) return;
        setCatalog(body);
        if (editor) {
          const rawId = new URLSearchParams(window.location.search).get("id");
          if (rawId !== null) {
            const product = body.products.find((p: Product) => String(p.id) === rawId);
            if (!product) throw new Error("Product not found.");
            setId(product.id); setUpdatedAt(product.updated_at); setDraft({ name: product.name, product_type: product.product_type, subtitle: product.subtitle, description: product.description, price_eur: Number(product.price_eur), compatibility: product.compatibility, current_version: product.current_version, release_date: product.release_date, category_id: product.category_id, complexity_id: product.complexity_id, tool_ids: product.tool_ids });
            setPendingTools(product.tool_ids); setDirty(false);
          }
        }
        setError(null);
      } catch (reason) { if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to load products."); }
      finally { if (!cancelled) setLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, [userId, editor, revision]);
  const selected = catalog?.products.find(p => p.id === id);
  const readOnly = selected?.published ?? false;
  function choose(kind: ProductType) {
    setDraft({ name: "", product_type: kind, subtitle: "", description: "", price_eur: 0, compatibility: "", current_version: "", release_date: null, category_id: 0, complexity_id: 0, tool_ids: [] }); setDirty(true);
  }
  function change<K extends keyof DraftInput>(key: K, value: DraftInput[K]) { setDraft(d => d ? { ...d, [key]: value } : d); setDirty(true); setMessage(null); }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!draft || busy || readOnly) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      requestId.current ??= crypto.randomUUID();
      const response = await fetch("/api/admin/products", { method: "POST", headers: { Authorization: "Bearer " + await access(), "Content-Type": "application/json" }, body: JSON.stringify({ requestId: requestId.current, data: draft, ...(id ? { productId: id, expectedUpdatedAt: updatedAt } : {}) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to save draft.");
      setId(body.draft.id); setUpdatedAt(body.draft.updated_at); setDirty(false); setMessage(body.message);
      window.history.replaceState(null, "", "/admin/products/edit?id=" + body.draft.id);
      setRevision(v => v + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save draft."); }
    finally { setBusy(false); }
  }
  async function publish() {
    if (!id || !updatedAt || dirty || busy || readOnly || draft?.product_type !== "tool") return;
    if (!window.confirm("Publish " + draft.name + " on the website? Check its content and download package first.")) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch("/api/admin/products", { method: "PATCH", headers: { Authorization: "Bearer " + await access(), "Content-Type": "application/json" }, body: JSON.stringify({ productId: id, expectedUpdatedAt: updatedAt }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Unable to publish tool.");
      setMessage(body.message); setRevision(v => v + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to publish tool."); }
    finally { setBusy(false); }
  }
  async function upload(file: File | undefined) {
    if (!file || !id || busy || dirty || readOnly) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      if (file.size > 4 * 1024 * 1024) throw new Error("Choose an image up to 4 MB.");
      const response = await fetch("/api/admin/products/media?productId=" + id, { method: "POST", headers: { Authorization: "Bearer " + await access(), "Content-Type": "application/octet-stream" }, body: file });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Unable to upload image.");
      setUpdatedAt(body.draft.updated_at); setMessage(body.message); setRevision(v => v + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to upload image."); }
    finally { setBusy(false); }
  }
  if (authLoading || (!loaded && user)) return <p>Loading products...</p>;
  if (!user) return <p><a href="/user">Log in</a> with your admin account to manage products.</p>;
  if (!catalog) return <div role="alert">{error ?? "Unable to load products."}<button type="button" onClick={() => setRevision(v => v+1)}>Retry</button></div>;
  const tools = catalog.products.filter(p => p.product_type === "tool" && p.published);
  if (!editor) return <section className="admin-products">
    <h2>Products</h2>
    <div className="admin-product-filters"><label>State<select value={stateFilter} onChange={e => setStateFilter(e.target.value)}><option value="all">All</option><option value="published">Published</option><option value="draft">Unpublished</option></select></label><label>Type<select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}><option value="all">All</option>{productTypes.map(t => <option key={t}>{t}</option>)}</select></label><label>Search<input value={query} onChange={e => setQuery(e.target.value)} /></label></div>
    <div className="product-grid admin-product-grid"><a className="card admin-new-product" href="/admin/products/edit"><span>＋</span>New product</a>
      {catalog.products.filter(p => (stateFilter === "all" || p.published === (stateFilter === "published")) && (typeFilter === "all" || p.product_type === typeFilter) && (p.name + " " + p.subtitle).toLowerCase().includes(query.toLowerCase())).map(p => {
        const image = artwork(p); return <a key={p.id} className="product-card admin-product-card" href={"/admin/products/edit?id=" + p.id}>{image ? <div className="media-frame"><Image src={image} alt={p.name} width={640} height={360} unoptimized /></div> : <div className="admin-product-artwork">No artwork</div>}<div className="card-info"><h3>{p.name}</h3><p>{p.subtitle}</p><div className="tags"><span className="card-tag">{p.product_type.toUpperCase()}</span><span className="card-tag">{p.published ? "PUBLISHED" : "UNPUBLISHED"}</span></div><p>€{Number(p.price_eur).toFixed(2)}</p></div></a>;
      })}
    </div>
  </section>;
  return <section className="admin-products admin-product-editor"><a href="/admin?section=products">← Admin products</a><h1>{id ? draft?.name : "New product"}</h1>
    {error && <p role="alert" className="admin-product-error">{error}</p>}{message && <p role="status">{message}</p>}
    {!draft ? <div className="admin-type-choice" role="dialog" aria-modal="false" aria-labelledby="product-type-title"><h2 id="product-type-title">Choose product type</h2>{productTypes.map(t => <button key={t} type="button" onClick={() => choose(t)}>{t.toUpperCase()}</button>)}</div> : <>
      {readOnly && <p>This product is published. This editor currently saves unpublished drafts only. <a href={"/product?slug=" + selected?.slug}>View product</a></p>}
      <form onSubmit={save}><fieldset disabled={busy || readOnly}><div className="admin-product-fields">
        <label>Title<input required pattern="[a-z0-9][a-z0-9_-]{0,79}" maxLength={80} value={draft.name} onChange={e => change("name",e.target.value)} placeholder="qatool01" /><small>Lowercase letters, numbers, underscores or hyphens. Slug matches the title.</small></label>
        <label>Type<input value={draft.product_type} readOnly /></label>
        <label className="admin-product-wide">Subtitle<input required maxLength={200} value={draft.subtitle} onChange={e => change("subtitle",e.target.value)} /></label>
        <label className="admin-product-wide">Description<textarea required maxLength={20000} rows={10} value={draft.description} onChange={e => change("description",e.target.value)} /></label>
        <label>Price · EUR including tax<input required type="number" min={0} max={999999.99} step="0.01" value={draft.price_eur} onChange={e => change("price_eur",Number(e.target.value))} /></label>
        <label>Version<input required maxLength={40} value={draft.current_version} onChange={e => change("current_version",e.target.value)} /></label>
        <label>Release date<input type="date" value={draft.release_date ?? ""} onChange={e => change("release_date",e.target.value || null)} /></label>
        <label className="admin-product-wide">Compatibility<input required maxLength={200} value={draft.compatibility} onChange={e => change("compatibility",e.target.value)} /></label>
        <label>Category<select required value={draft.category_id || ""} onChange={e => change("category_id",Number(e.target.value))}><option value="">Choose category</option>{catalog.categories.filter(v => v.active || v.id === draft.category_id).map(v => <option key={v.id} value={v.id}>{v.name}{v.active ? "" : " (inactive)"}</option>)}</select></label>
        <label>Complexity<select required value={draft.complexity_id || ""} onChange={e => change("complexity_id",Number(e.target.value))}><option value="">Choose complexity</option>{catalog.complexities.filter(v => v.active || v.id === draft.complexity_id).map(v => <option key={v.id} value={v.id}>{v.name}{v.active ? "" : " (inactive)"}</option>)}</select></label>
      </div>
      <div className="tags admin-product-selected-tags">{[catalog.categories.find(v => v.id === draft.category_id)?.name,catalog.complexities.find(v => v.id === draft.complexity_id)?.name].filter(Boolean).map(name => <span key={name} className="card-tag">{name?.toUpperCase()}</span>)}</div>
      {draft.product_type !== "tool" && <section className="admin-product-includes"><h2>Included tools</h2><details><summary>Select tools</summary>{tools.map(t => <label key={t.id}><input type="checkbox" checked={pendingTools.includes(t.id)} onChange={e => setPendingTools(v => e.target.checked ? [...v,t.id] : v.filter(id => id !== t.id))} />{t.name} · €{Number(t.price_eur).toFixed(2)}</label>)}<button type="button" onClick={() => change("tool_ids",pendingTools)}>Add</button></details><div className="card-tags">{draft.tool_ids.map(id => <span key={id} className="card-tag">{catalog.products.find(t => t.id === id)?.name}<button type="button" aria-label={"Remove " + catalog.products.find(t => t.id === id)?.name} onClick={() => { change("tool_ids",draft.tool_ids.filter(v => v !== id)); setPendingTools(v => v.filter(x => x !== id)); }}> ×</button></span>)}</div><p>Fixed bundle price; already-owned tools do not reduce it. Choose a price below the tools’ combined price. Bundle and project sales are not enabled yet.</p></section>}
      <button type="submit">{busy ? "Saving..." : "Accept · save unpublished draft"}</button></fieldset></form>
      <section className="admin-product-media"><h2>Media</h2><p>The first image becomes the card artwork. Save the draft before adding images. PNG, JPG or WebP up to 4 MB; product artwork only.</p><div className="admin-media-grid">{selected?.product_media.map(m => { const url = mediaUrl(m); return url ? <div key={m.id}><Image src={url} alt="Product artwork" width={640} height={360} unoptimized /><small>{m.role}</small></div> : null; })}</div><label className="admin-media-upload">Add media<input type="file" accept="image/png,image/jpeg,image/webp" disabled={!id || busy || dirty || readOnly} onChange={e => { void upload(e.target.files?.[0]); e.target.value=""; }} /></label>{dirty && id && <p>Save your changes before adding media.</p>}</section>
      {draft.product_type === "tool" && id && !readOnly && <section className="admin-product-publication"><h2>Publication</h2><p>Upload the release ZIP in <a href="/admin?section=downloads">Tool files</a>, then return here to publish. For paid tools, configure checkout in <a href="/admin?section=prices">Paddle prices</a> after publishing.</p><button type="button" disabled={dirty || busy} onClick={publish}>Publish tool</button></section>}
      {draft.product_type === "project" && <p>Project files and publishing will be connected in the next product-management batch. This draft is kept unpublished.</p>}
    </>}
  </section>;
}
