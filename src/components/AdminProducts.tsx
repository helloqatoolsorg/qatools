"use client";
import { PriceEditor } from "@/components/AdminPrices";
import ProductPublication from "@/components/ProductPublication";
import AdminDownloads from "@/components/AdminDownloads";
import AdminToolPackage from "@/components/AdminToolPackage";
import PublicationState from "@/components/PublicationState";
import Image from "next/image";
import { useRouter } from "next/navigation";
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
  const router=useRouter();
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id;
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [id, setId] = useState<number | null>(null);
  const [priceText,setPriceText]=useState("0");
  const [draft, setDraft] = useState<DraftInput | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [pendingTools, setPendingTools] = useState<number[]>([]);
  const [stateFilter, setStateFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [existingProductId,setExistingProductId]=useState<number|null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [packageBusy, setPackageBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const artworkInput = useRef<HTMLInputElement>(null);
  const [pendingArtwork, setPendingArtwork] = useState<{file:File;url:string} | null>(null);
  useEffect(() => () => { if (pendingArtwork) URL.revokeObjectURL(pendingArtwork.url); }, [pendingArtwork]);
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
            setId(product.id); setUpdatedAt(product.updated_at); setDraft({ name: product.name, product_type: product.product_type, subtitle: product.subtitle, description: product.description, price_eur: product.price_eur === null ? null : Number(product.price_eur), compatibility: product.compatibility, current_version: product.current_version, release_date: product.release_date, category_id: product.category_id ?? 0, complexity_id: product.complexity_id ?? 0, tool_ids: product.tool_ids });
            setPriceText(product.price_eur === null ? "" : String(product.price_eur)); setPendingTools(product.tool_ids); setDirty(false);
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
    setPriceText("0");
    setDraft({ name: "", product_type: kind, subtitle: "", description: "", price_eur: 0, compatibility: "", current_version: "", release_date: null, category_id: 0, complexity_id: 0, tool_ids: [] }); setDirty(true);
  }
  function change<K extends keyof DraftInput>(key: K, value: DraftInput[K]) { setDraft(d => d ? { ...d, [key]: value } : d); setDirty(true); setMessage(null); }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!draft || busy || packageBusy || readOnly) return;
    if(priceText!=="" && !/^(0|[1-9][0-9]{0,5})([.,][0-9]{1,2})?$/.test(priceText)){setError("Enter a price with at most two decimal places.");return;}
    const amount=priceText===""?null:Number(priceText.replace(",","."));
    setBusy(true); setError(null); setMessage(null); setExistingProductId(null);
    try {
      requestId.current ??= crypto.randomUUID();
      const response = await fetch("/api/admin/products", { method: "POST", headers: { Authorization: "Bearer " + await access(), "Content-Type": "application/json" }, body: JSON.stringify({ requestId: requestId.current, data: {...draft,price_eur:amount}, ...(id ? { productId: id, expectedUpdatedAt: updatedAt } : {}) }) });
      const body = await response.json();
      if (!response.ok) { setExistingProductId(body.existingProduct?.id ?? null); throw new Error(body.error ?? "Unable to save draft."); }
      setId(body.draft.id); setUpdatedAt(body.draft.updated_at); setDirty(false); setMessage(body.message);
      window.history.replaceState(null, "", "/admin/products/edit?id=" + body.draft.id);
      if (pendingArtwork) {
        if (!await upload(pendingArtwork.file, true, { id: body.draft.id, updatedAt: body.draft.updated_at, mediaId: selected?.product_media.find(m => m.role === "card")?.id ?? null })) return;
      } else setRevision(v => v + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save draft."); }
    finally { setBusy(false); }
  }
  async function discardDraft() {
    if (!id || !updatedAt || busy || packageBusy || readOnly) return;
    if (!window.confirm("Delete this unused draft and discard any unsaved changes? Its name will become available again. Products with release history or linked records cannot be deleted.")) return;
    setBusy(true); setError(null);
    try {
      const response=await fetch("/api/admin/products",{method:"DELETE",headers:{Authorization:"Bearer "+await access(),"Content-Type":"application/json"},body:JSON.stringify({productId:id,expectedUpdatedAt:updatedAt})});
      const body=await response.json(); if(!response.ok) throw new Error(body.error ?? "Unable to delete draft.");
      router.push("/admin?section=products");
    } catch(reason) { setError(reason instanceof Error ? reason.message : "Unable to delete draft."); }
    finally {setBusy(false);}
  }
  async function upload(file: File | undefined, main = false, target?: {id:number;updatedAt:string;mediaId:number|null}) {
    const targetId = target?.id ?? id;
    if (!file || !targetId || (!target && (busy || packageBusy || dirty || readOnly))) return false;
    setBusy(true); setError(null); setMessage(null);
    try {
      if (file.size > 4 * 1024 * 1024) throw new Error("Choose an image up to 4 MB.");
      const params = new URLSearchParams({productId:String(targetId)});
      if (main) { params.set("role","card"); params.set("expectedUpdatedAt",target?.updatedAt ?? updatedAt ?? ""); params.set("expectedMediaId",String(target ? target.mediaId ?? "" : selected?.product_media.find(m => m.role === "card")?.id ?? "")); }
      const response = await fetch("/api/admin/products/media?" + params, { method: "POST", headers: { Authorization: "Bearer " + await access(), "Content-Type": "application/octet-stream" }, body: file });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Unable to upload image.");
      if (main && body.media) {
        setCatalog(c => c ? {...c,products:c.products.map(p => p.id !== targetId ? p : {...p,updated_at:body.draft.updated_at,product_media:[...p.product_media.filter(m => m.id !== body.media.id).map(m => ["main","card"].includes(m.role) ? {...m,role:"gallery"} : m),body.media]})} : c);
        setPendingArtwork(null);
      }
      setUpdatedAt(body.draft.updated_at); setMessage(body.message); setRevision(v => v + 1); return true;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to upload image."); return false; }
    finally { setBusy(false); }
  }
  function chooseArtwork(file: File | undefined) {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024 || !["image/png","image/jpeg","image/webp","image/gif"].includes(file.type)) { setError("Choose a PNG, JPG, WebP or GIF up to 4 MB."); return; }
    setError(null); setPendingArtwork({file,url:URL.createObjectURL(file)});
    if (id && !dirty) void upload(file,true);
  }
  if (authLoading || (!loaded && user)) return <p>Loading products...</p>;
  if (!user) return <p><a href="/user">Log in</a> with your admin account to manage products.</p>;
  if (!catalog) return <div role="alert">{error ?? "Unable to load products."}<button type="button" onClick={() => setRevision(v => v+1)}>Retry</button></div>;
  const tools = catalog.products.filter(p => p.product_type === "tool" && p.published);
  if (!editor) return <section className="admin-products">
    <h2>Products</h2>
    <div className="admin-product-filters"><label>State<select value={stateFilter} onChange={e => setStateFilter(e.target.value)}><option value="all">All</option><option value="published">Published</option><option value="draft">Unpublished</option></select></label><label>Type<select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}><option value="all">All</option>{productTypes.map(t => <option key={t}>{t}</option>)}</select></label><label>Search<input value={query} onChange={e => setQuery(e.target.value)} /></label></div>
    <div className="admin-product-entry-actions"><a className="card admin-new-product" href="/admin/products/edit">＋ New product</a><button type="button" className="card admin-new-product" disabled={!catalog.products.some(p=>!p.published)} onClick={()=>{setStateFilter("draft");setTypeFilter("all");setQuery("");}}>Continue editing</button></div>
    <div className="product-grid admin-product-grid">
      {catalog.products.filter(p => (stateFilter === "all" || p.published === (stateFilter === "published")) && (typeFilter === "all" || p.product_type === typeFilter) && (p.name + " " + p.slug + " " + p.subtitle).toLowerCase().includes(query.toLowerCase())).map(p => {
        const image = artwork(p); return <article key={p.id} className="product-card admin-product-card"><a href={"/admin/products/edit?id="+p.id}>{image ? <div className="media-frame"><Image src={image} alt={p.name} width={640} height={360} unoptimized /></div> : <div className="admin-product-artwork">No artwork</div>}<div className="card-info"><h3>{p.name}</h3><p>{p.subtitle}</p><div className="tags"><span className="card-tag">{p.product_type.toUpperCase()}</span><PublicationState published={p.published}/></div><p>{p.price_eur===null?"Price not set":"€"+Number(p.price_eur).toFixed(2)}</p></div></a>{!p.published&&<div className="admin-card-actions"><a className="admin-card-action" href={"/admin/products/edit?id="+p.id}>Edit</a><a className="admin-card-action" href={"/admin/products/edit?id="+p.id+"&publish=1"}>Publish</a></div>}</article>;
      })}
    </div>
  </section>;
  return <section className="admin-products admin-product-editor"><a href="/admin?section=products">← Admin products</a><div className="admin-product-title"><h1>{id ? draft?.name : "New product"}</h1><PublicationState published={readOnly} /></div>
    {error && <p role="alert" className="admin-product-error">{error}</p>}{existingProductId && <p><a href={"/admin/products/edit?id="+existingProductId}>Open existing product</a></p>}{message && <p role="status">{message}</p>}
    {!draft ? <div className="admin-type-choice" role="dialog" aria-modal="false" aria-labelledby="product-type-title"><h2 id="product-type-title">Choose product type</h2>{productTypes.map(t => <button key={t} type="button" onClick={() => choose(t)}>{t.toUpperCase()}</button>)}</div> : <>
      {readOnly && <p>This product is published. This editor currently saves unpublished drafts only. <a href={"/product?slug=" + selected?.slug}>View product</a></p>}
      <div className="product-hero admin-product-hero"><div className="admin-product-media-column">      <section className="admin-product-media"><input ref={artworkInput} className="admin-artwork-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy || packageBusy || readOnly} onChange={e => { chooseArtwork(e.target.files?.[0]); e.target.value=""; }} />
          <button type="button" className="product-media admin-main-artwork" disabled={busy || packageBusy || readOnly} onClick={() => artworkInput.current?.click()} aria-label={pendingArtwork || (selected && artwork(selected)) ? "Change main image" : "Upload main image"}>
            {pendingArtwork || (selected && artwork(selected)) ? <Image src={pendingArtwork?.url ?? artwork(selected!)!} alt="Product preview" width={960} height={600} unoptimized /> : <span className="admin-hero-placeholder">＋ Add media</span>}
            <span className="admin-artwork-overlay">{busy ? "Uploading..." : pendingArtwork || (selected && artwork(selected)) ? "Click to change image" : "PNG · JPG · WebP · GIF"}</span>
          </button>
          {pendingArtwork && <p>{dirty || !id ? "Image selected. Save the draft to upload it." : "Image selected."}</p>}
          {draft.product_type !== "tool" && <p>qatools.json · included automatically in the release package</p>}<h2>Gallery</h2><p>PNG, JPG, WebP or GIF up to 4 MB.</p><div className="admin-media-grid">{selected?.product_media.filter(m => m.role !== "card" && m.role !== "main").map(m => { const url = mediaUrl(m); return url ? <div key={m.id}><Image src={url} alt="Product artwork" width={640} height={360} unoptimized /><small>{m.role}</small></div> : null; })}</div><label className="admin-media-upload">Add gallery image<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={!id || busy || dirty || readOnly} onChange={e => { void upload(e.target.files?.[0]); e.target.value=""; }} /></label>{dirty && id && <p>Save your changes before adding media.</p>}</section>{draft.product_type === "tool" && <AdminToolPackage key={id ?? "new"} productId={id} disabled={busy || dirty} onBusyChange={setPackageBusy} />}{id && readOnly && <details><summary>Advanced ZIP replacement and download availability</summary><AdminDownloads key={id} productId={id} products={[{id,name:draft.name,slug:selected?.slug ?? draft.name,published:readOnly}]} /></details>}</div><div className="product-info admin-product-info"><form onSubmit={save}><fieldset disabled={busy || packageBusy || readOnly}><div className="admin-product-fields">
        <label>Title<input required pattern="[a-z0-9][a-z0-9_-]{0,79}" maxLength={80} value={draft.name} onChange={e => change("name",e.target.value)} placeholder="qatool01" /><small>Lowercase letters, numbers, underscores or hyphens. Slug matches the title.</small></label>
        <label>Type<input value={draft.product_type} readOnly /></label>
        <label className="admin-product-wide">Subtitle<input maxLength={200} value={draft.subtitle} onChange={e => change("subtitle",e.target.value)} /></label>
        <label className="admin-product-wide">Description<textarea maxLength={20000} rows={10} value={draft.description} onChange={e => change("description",e.target.value)} /></label>
      {draft.product_type !== "tool" && <section className="admin-product-includes admin-product-wide"><h2>Included tools</h2>
        <details className="admin-bundle-filter"><summary className="menu-trigger">select tools ＋</summary><div className="dropdown filter-menu open filter-group admin-bundle-options">
          <div className="filter-label">TOOLS</div>{tools.map(t => <button key={t.id} type="button" className={"filter-option " + (pendingTools.includes(t.id) ? "selected" : "")} aria-pressed={pendingTools.includes(t.id)} onClick={() => setPendingTools(v => v.includes(t.id) ? v.filter(id => id !== t.id) : [...v,t.id])}>{t.name.toUpperCase()}</button>)}
          <button className="admin-bundle-add" type="button" onClick={event => { change("tool_ids",pendingTools); event.currentTarget.closest("details")?.removeAttribute("open"); }}>ADD</button></div>
        </details><div className="tags">{draft.tool_ids.map(id => <button key={id} type="button" className="filter-chip admin-included-tool" aria-label={"Remove " + catalog.products.find(t => t.id === id)?.name} onClick={() => { change("tool_ids",draft.tool_ids.filter(v => v !== id)); setPendingTools(v => v.filter(x => x !== id)); }}>{catalog.products.find(t => t.id === id)?.name} <span aria-hidden="true">×</span></button>)}</div>
        <p>Fixed bundle price; already-owned tools do not reduce it. Choose a price below the tools’ combined price. Bundle and project sales are not enabled yet.</p>
      </section>}
        <label>Price · EUR including tax<input type="text" inputMode="decimal" maxLength={9} value={priceText} onChange={e => {setPriceText(e.target.value);setDirty(true);setMessage(null);}} placeholder="0.00" /></label>
        <label>Version<input maxLength={40} value={draft.current_version} onChange={e => change("current_version",e.target.value)} /></label>
        <p>Release date is recorded when first published.</p>
        <label className="admin-product-wide">Compatibility<input maxLength={200} value={draft.compatibility} onChange={e => change("compatibility",e.target.value)} /></label>
        <label>Category<select value={draft.category_id || ""} onChange={e => change("category_id",Number(e.target.value))}><option value="">Choose category</option>{catalog.categories.filter(v => v.active || v.id === draft.category_id).map(v => <option key={v.id} value={v.id}>{v.name}{v.active ? "" : " (inactive)"}</option>)}</select></label>
        <label>Complexity<select value={draft.complexity_id || ""} onChange={e => change("complexity_id",Number(e.target.value))}><option value="">Choose complexity</option>{catalog.complexities.filter(v => v.active || v.id === draft.complexity_id).map(v => <option key={v.id} value={v.id}>{v.name}{v.active ? "" : " (inactive)"}</option>)}</select></label>
      </div>
      <div className="tags admin-product-selected-tags">{[catalog.categories.find(v => v.id === draft.category_id)?.name,catalog.complexities.find(v => v.id === draft.complexity_id)?.name].filter(Boolean).map((name,index) => <span key={index} className="card-tag">{name?.toUpperCase()}</span>)}</div>

      <button type="submit">{busy ? "Saving..." : "Accept · save unpublished draft"}</button></fieldset></form></div></div>

      {id && !readOnly && <button type="button" disabled={busy || packageBusy} onClick={()=>void discardDraft()}>Delete unused draft</button>}
      {id && readOnly && <section><h2>Paddle price</h2><PriceEditor key={id} productId={id}/></section>}
      {id && !readOnly && <ProductPublication productId={id} updatedAt={updatedAt} disabled={dirty || busy || packageBusy} onPublished={()=>setRevision(v=>v+1)} />}
      {draft.product_type === "project" && <p>Project files and publishing will be connected in the next product-management batch. This draft is kept unpublished.</p>}
    </>}
  </section>;
}
