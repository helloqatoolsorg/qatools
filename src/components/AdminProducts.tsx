"use client";
import { PriceEditor } from "@/components/AdminPrices";
import ProductPublication from "@/components/ProductPublication";
import AdminDownloads from "@/components/AdminDownloads";
import AdminProductCatalog from "./AdminProductCatalog";
import { readDraftRecovery, writeDraftRecovery, clearDraftRecovery, type DraftRecovery } from "@/lib/adminDraftRecovery";
import AdminGallery, {saveArtwork, type PendingMedia} from "@/components/AdminGallery";
import AdminToolPackage from "@/components/AdminToolPackage";
import PublicationState from "@/components/PublicationState";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { productSlug, validProductTitle, productTypes, type DraftInput, type ProductType } from "@/lib/productDraft";
import "./AdminProducts.css";
type Media = { id: number; file_path: string | null; role: string; sort_order: number };
type Product = DraftInput & { id: number; slug: string; published: boolean; updated_at: string; prepared_identity?: object | null; has_installer?:boolean; draft_request_id?:string; product_media: Media[] };
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
  const [recovery,setRecovery]=useState<DraftRecovery|null>(null);
  const [recoveryWarning,setRecoveryWarning]=useState<string|null>(null);
  const [pendingGallery,setPendingGallery]=useState<File[]>([]);
  const [editedMedia,setEditedMedia]=useState<PendingMedia[]|null>(null);
  const [importFile,setImportFile]=useState<File|null>(null);
  const [importPending,setImportPending]=useState(false);
  const [pendingTool,setPendingTool]=useState<File|null>(null);
  const restored=useRef(false);
  const loadedOwner=useRef<string|null>(null);
  const saving=useRef(false);
  const fileWrites=useRef(0);
  const recoveryOwner=useRef<string|null>(null);
  const uploading=useRef(false);
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
    if (!userId) {restored.current=false;loadedOwner.current=null;return;}
    if(loadedOwner.current!==userId){loadedOwner.current=userId;restored.current=false;recoveryOwner.current=null;requestId.current=null;setCatalog(null);setLoaded(false);setDraft(null);setId(null);setUpdatedAt(null);setPendingArtwork(null);setPendingGallery([]);setPendingTool(null);setDirty(false);setRecovery(null);}
    (async () => {
      try {
        const response = await fetch("/api/admin/products", { cache: "no-store", headers: { Authorization: "Bearer " + await access() } });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Unable to load products.");
        if (cancelled) return;
        setCatalog(body);setEditedMedia(null);setPendingArtwork(null);setPendingGallery([]);
        if (!restored.current) {
          let snapshot:DraftRecovery|null=null;
          try {snapshot=await readDraftRecovery(userId);} catch {setRecoveryWarning("Browser recovery is unavailable. Save the draft before leaving this page.");}
          if(cancelled)return;
          const params=new URLSearchParams(window.location.search);
          if(snapshot?.id && !body.products.some((p:Product)=>p.id===snapshot!.id && !p.published)) {await clearDraftRecovery(userId);snapshot=null;}
          setRecovery(snapshot);setRecoveryWarning(snapshot?.recoveryWarning ?? null);restored.current=true;
          if(editor && params.has("resume") && snapshot) {
            requestId.current=snapshot.requestId;recoveryOwner.current=snapshot.requestId;setId(snapshot.id);setUpdatedAt(snapshot.updatedAt);setDraft(snapshot.draft);setPriceText(snapshot.priceText);setPendingTools(snapshot.draft.tool_ids);setPendingGallery(snapshot.galleryFiles);setPendingTool(snapshot.toolFile);setDirty(true);
            if(snapshot.mainFile)setPendingArtwork({file:snapshot.mainFile,url:URL.createObjectURL(snapshot.mainFile)});
            setRecoveryWarning(snapshot.recoveryWarning ?? null);setLoaded(true);return;
          }
        }
        if (editor) {
          const rawId = new URLSearchParams(window.location.search).get("id");
          if (rawId !== null) {
            const product = body.products.find((p: Product) => String(p.id) === rawId);
            if (!product) throw new Error("Product not found.");
            if(product.prepared_identity && !product.has_installer)requestId.current=product.draft_request_id ?? null;
            setId(product.id); setUpdatedAt(product.updated_at); setDraft({ name: product.name, slug:product.slug, product_type: product.product_type, subtitle: product.subtitle, description: product.description, price_eur: product.price_eur === null ? null : Number(product.price_eur), compatibility: product.compatibility, current_version: product.current_version, release_date: product.release_date, category_id: product.category_id ?? 0, complexity_id: product.complexity_id ?? 0, tool_ids: product.tool_ids });
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
  useEffect(()=>{
    if(!editor || !userId || !loaded || !draft || readOnly || !restored.current)return;
    if(!dirty && !pendingArtwork && !pendingGallery.length && !pendingTool) {
      if(!recoveryOwner.current || recoveryOwner.current!==requestId.current)return;
      recoveryOwner.current=null;setRecovery(null);void clearDraftRecovery(userId).catch(()=>setRecoveryWarning("Unable to clear the browser recovery copy."));return;
    }
    requestId.current ??=crypto.randomUUID();
    const snapshot:DraftRecovery={version:1,requestId:requestId.current,id,updatedAt,draft,priceText,savedAt:new Date().toISOString(),fileRevision:crypto.randomUUID(),mainFile:pendingArtwork?.file ?? null,galleryFiles:pendingGallery,toolFile:pendingTool};
    recoveryOwner.current=requestId.current;setRecovery(snapshot);fileWrites.current++;
    try {void writeDraftRecovery(userId,snapshot).then(()=>setRecoveryWarning(null)).catch(()=>setRecoveryWarning("Browser recovery could not save your pending files. Keep this page open and save or upload them before leaving.")).finally(()=>{fileWrites.current--;});}
    catch {fileWrites.current--;setRecoveryWarning("Browser recovery is unavailable. Save before leaving this page.");}
  },[editor,userId,loaded,draft,priceText,id,updatedAt,dirty,readOnly,pendingArtwork,pendingGallery,pendingTool]);
  useEffect(()=>{
    const protect=(event:BeforeUnloadEvent)=>{if(fileWrites.current>0 || recoveryWarning){event.preventDefault();event.returnValue="";}};
    window.addEventListener("beforeunload",protect);return()=>window.removeEventListener("beforeunload",protect);
  },[recoveryWarning]);
  async function importTool(file:File) {
    if(busy)return;setBusy(true);setError(null);setImportFile(file);setImportPending(true);
    requestId.current ??=crypto.randomUUID();
    try {
      const response=await fetch("/api/admin/products/import?requestId="+requestId.current,{method:"POST",headers:{Authorization:"Bearer "+await access(),"Content-Type":"application/zip"},body:file});
      const result=await response.json();
      if(result.draft){
        const imported:DraftInput={name:result.draft.name,slug:result.draft.slug,product_type:"tool",subtitle:"",description:"",price_eur:null,compatibility:"",current_version:"",release_date:null,category_id:0,complexity_id:0,tool_ids:[]};
        setId(result.draft.id);setUpdatedAt(result.draft.updated_at);setDraft(imported);setPriceText("");setDirty(true);
        setCatalog(c=>c?{...c,products:[...c.products.filter(p=>p.id!==result.draft.id),{...imported,id:result.draft.id,slug:result.draft.slug,updated_at:result.draft.updated_at,published:false,prepared_identity:{},has_installer:response.ok,product_media:[]}]}:c);
      }
      if(!response.ok){setExistingProductId(result.existingProduct?.id ?? null);throw Error(result.error ?? "Unable to import tool.");}
      setImportPending(false);setImportFile(null);setMessage(result.message);
      window.history.replaceState(null,"","/admin/products/edit?id="+result.draft.id);
    }catch(reason){setError(reason instanceof Error?reason.message:"Unable to import tool.");}finally{setBusy(false);}
  }
  function choose(kind: ProductType) {
    requestId.current=crypto.randomUUID();setPendingTools([]);setImportFile(null);setImportPending(false);
    setPriceText("0");
    setDraft({ name: "", product_type: kind, subtitle: "", description: "", price_eur: 0, compatibility: "", current_version: "", release_date: null, category_id: 0, complexity_id: 0, tool_ids: [] }); setDirty(true);
  }
  function change<K extends keyof DraftInput>(key: K, value: DraftInput[K]) { setDraft(d => d ? { ...d, [key]: value } : d); setDirty(true); setMessage(null); }
  async function saveMetadata() {
    if(saving.current)throw new Error("Wait for the current save to finish.");
    if(!draft || readOnly)throw new Error("Choose an unpublished draft.");
    if(!draft.name || (draft.product_type!=="tool" && !validProductTitle(draft.name)))throw new Error("Enter a valid title before uploading or saving. Other product fields can be completed later.");
    if(priceText!=="" && !/^(0|[1-9][0-9]{0,5})([.,][0-9]{1,2})?$/.test(priceText))throw new Error("Enter a price with at most two decimal places.");
    saving.current=true;
    try {
      requestId.current ??=crypto.randomUUID();
      const amount=priceText===""?null:Number(priceText.replace(",","."));
      const response=await fetch("/api/admin/products",{method:"POST",headers:{Authorization:"Bearer "+await access(),"Content-Type":"application/json"},body:JSON.stringify({requestId:requestId.current,data:{...draft,price_eur:amount},...(id?{productId:id,expectedUpdatedAt:updatedAt}:{})})});
      let body=await response.json();
      if(!response.ok){setExistingProductId(body.existingProduct?.id ?? null);throw new Error(body.error ?? "Unable to save draft.");}
      if(!id){
        setId(body.draft.id);setUpdatedAt(body.draft.updated_at);
        const updated=await fetch("/api/admin/products",{method:"POST",headers:{Authorization:"Bearer "+await access(),"Content-Type":"application/json"},body:JSON.stringify({requestId:requestId.current,data:{...draft,price_eur:amount},productId:body.draft.id,expectedUpdatedAt:body.draft.updated_at})});
        const result=await updated.json();if(!updated.ok)throw new Error(result.error ?? "Draft created, but the latest edits were not saved. Retry to update it.");body=result;
      }
      const saved:Product={...draft,price_eur:amount,id:body.draft.id,slug:body.draft.slug ?? draft.slug ?? productSlug(draft.name),prepared_identity:selected?.prepared_identity,published:false,updated_at:body.draft.updated_at,product_media:selected?.product_media ?? []};
      setCatalog(c=>c?{...c,products:[...c.products.filter(p=>p.id!==saved.id),saved]}:c);
      setDraft(d=>d?{...d,slug:saved.slug}:d);setId(saved.id);setUpdatedAt(saved.updated_at);setDirty(false);setMessage(body.message);
      window.history.replaceState(null,"","/admin/products/edit?id="+saved.id);
      return {id:saved.id,updatedAt:saved.updated_at,mediaId:selected?.product_media.find(m=>m.role==="card")?.id ?? null};
    } finally {saving.current=false;}
  }
  async function saveWithMedia() {
    if(uploading.current)throw new Error("Wait for the current upload to finish.");
    uploading.current=true;
    setBusy(true);setError(null);setMessage(null);setExistingProductId(null);
    try {
      const target=id&&!dirty?{id,updatedAt:updatedAt!,mediaId:selected?.product_media.find(m=>m.role==="card")?.id ?? null}:await saveMetadata();
      if(pendingArtwork || pendingGallery.length || editedMedia){
        let rows:PendingMedia[]=[...(editedMedia ?? selected?.product_media ?? [])];
        if(pendingArtwork){
          const main=rows.find(m=>m.role==="card") ?? rows.find(m=>m.role==="main");
          if(main)rows=rows.map(m=>m.id===main.id?{...m,file:pendingArtwork.file}:m);
          else rows.unshift({id:-1,file_path:null,role:"card",sort_order:0,file:pendingArtwork.file});
        }
        rows.sort((a,b)=>a.sort_order-b.sort_order || a.id-b.id);
        const offset=Math.max(0,...rows.map(m=>m.sort_order));
        rows.push(...pendingGallery.map((file,index)=>({id:-2-index,file_path:null,role:"gallery",sort_order:offset+index+1,file})));
        const result=await saveArtwork(target.id,target.updatedAt,rows);
        setUpdatedAt(result.updated_at);setPendingArtwork(null);setPendingGallery([]);setEditedMedia(null);
        setCatalog(c=>c?{...c,products:c.products.map(p=>p.id===result.id?{...p,updated_at:result.updated_at,product_media:result.media}:p)}:c);
        setMessage("Product updated.");
      }
      setRevision(v=>v+1);return target.id;
    } catch(reason){setMessage(null);setError(reason instanceof Error?reason.message:"Unable to update product.");throw reason;}
    finally {uploading.current=false;setBusy(false);}
  }
  async function save(event:React.FormEvent<HTMLFormElement>){event.preventDefault();if(busy||packageBusy)return;try{await saveWithMedia();}catch{/* Visible error is retained with the remaining files. */}}
  async function ensureToolDraft(){if(id){if(dirty || pendingArtwork || pendingGallery.length || editedMedia)throw new Error("Click Update product before changing tool files.");return id;}throw new Error("Save the draft before changing tool files.");}
  async function discardDraft() {
    if (!id || !updatedAt || busy || packageBusy || readOnly) return;
    if (!window.confirm("Delete this unused draft and discard any unsaved changes? Its name will become available again. Products with release history or linked records cannot be deleted.")) return;
    setBusy(true); setError(null);
    try {
      const response=await fetch("/api/admin/products",{method:"DELETE",headers:{Authorization:"Bearer "+await access(),"Content-Type":"application/json"},body:JSON.stringify({productId:id,expectedUpdatedAt:updatedAt})});
      const body=await response.json(); if(!response.ok) throw new Error(body.error ?? "Unable to delete draft.");
      if(userId)await clearDraftRecovery(userId);
      router.push("/admin?section=products");
    } catch(reason) { setError(reason instanceof Error ? reason.message : "Unable to delete draft."); }
    finally {setBusy(false);}
  }
  function chooseGallery(files:FileList|null){
    const images=Array.from(files ?? []);if(images.some(file=>file.size>4*1024*1024 || !["image/png","image/jpeg","image/webp","image/gif"].includes(file.type))){setError("Choose PNG, JPG, WebP or GIF images up to 4 MB each.");return;}
    if(images.length+pendingGallery.length+(editedMedia ?? selected?.product_media ?? []).length+(pendingArtwork && !selected?.product_media.some(m=>["card","main"].includes(m.role))?1:0)>20){setError("A product can have at most 20 media images.");return;}
    setPendingGallery(previous=>[...previous,...images]);setMessage(null);
  }
  function chooseArtwork(file: File | undefined) {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024 || !["image/png","image/jpeg","image/webp","image/gif"].includes(file.type)) { setError("Choose a PNG, JPG, WebP or GIF up to 4 MB."); return; }
    setError(null); setPendingArtwork({file,url:URL.createObjectURL(file)});

  }
  if (authLoading || (!loaded && user)) return <p>Loading products...</p>;
  if (!user) return <p><a href="/user">Log in</a> with your admin account to manage products.</p>;
  if (!catalog) return <div role="alert">{error ?? "Unable to load products."}<button type="button" onClick={() => setRevision(v => v+1)}>Retry</button></div>;
  const tools = catalog.products.filter(p => p.product_type === "tool" && p.published);
  if (!editor) return <><AdminProductCatalog catalog={catalog} recovery={recovery}/>{recoveryWarning && <p role="alert">{recoveryWarning}</p>}</>;
  return <section className="admin-products admin-product-editor"><a href="/admin?section=products">← Admin products</a><div className="admin-product-title"><h1>{id ? draft?.name : "New product"}</h1><PublicationState published={readOnly} /></div>
    {(pendingArtwork || pendingGallery.length>0 || editedMedia) && <p role="status">Pending image changes. Leaving this editor will not apply them.</p>}
    {dirty && !readOnly && <p>Unsaved changes are kept in this browser. Use Continue editing to return to this product.</p>}
    {recoveryWarning && <p role="alert" className="admin-product-error">{recoveryWarning}</p>}{error && <p role="alert" className="admin-product-error">{error} {id && <button type="button" disabled={busy || packageBusy} onClick={()=>setRevision(v=>v+1)}>Reload saved product</button>}</p>}{existingProductId && <p><a href={"/admin/products/edit?id="+existingProductId}>Open existing product</a></p>}{message && <p role="status">{message}</p>}
    {!draft ? <div className="admin-type-choice" role="dialog" aria-modal="false" aria-labelledby="product-type-title"><h2 id="product-type-title">Choose product type</h2>{productTypes.map(t => <button key={t} type="button" onClick={() => choose(t)}>{t.toUpperCase()}</button>)}</div> : draft.product_type==="tool" && (!id || importPending || (selected?.prepared_identity && selected.has_installer===false)) ? <section className="admin-type-choice"><h2>Upload prepared tool</h2><p>Choose the ZIP exported by Prepare qatools tool. Its Asset Label and Internal Name set the title and locked slug.</p><input type="file" accept=".zip" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(file)void importTool(file);}} />{importFile && <button type="button" disabled={busy} onClick={()=>void importTool(importFile)}>Retry import</button>}</section> : <>
      {selected?.prepared_identity && <p>Prepared tool installer · qatools.json and shared licensing files included automatically.</p>}{readOnly && <p>This product is published. Product images can be edited here; product details remain locked. <a href={"/product?slug=" + selected?.slug}>View product</a></p>}
      <div className="product-hero admin-product-hero"><div className="admin-product-media-column">      <section className="admin-product-media"><input ref={artworkInput} className="admin-artwork-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy || packageBusy} onChange={e => { chooseArtwork(e.target.files?.[0]); e.target.value=""; }} />
          <button type="button" className="product-media admin-main-artwork" disabled={busy || packageBusy} onClick={() => artworkInput.current?.click()} aria-label={pendingArtwork || (selected && artwork(selected)) ? "Change main image" : "Upload main image"}>
            {pendingArtwork || (selected && artwork(selected)) ? <Image src={pendingArtwork?.url ?? artwork(selected!)!} alt="Product preview" width={960} height={600} unoptimized /> : <span className="admin-hero-placeholder">＋ Add media</span>}
            <span className="admin-artwork-overlay">{busy ? "Uploading..." : pendingArtwork || (selected && artwork(selected)) ? "Click to change image" : "PNG · JPG · WebP · GIF"}</span>
          </button>
          {pendingArtwork && <p>Image selected. Click Update product to apply it.</p>}
          {draft.product_type !== "tool" && <p>qatools.json · included automatically in the release package</p>}<h2>Gallery</h2><p>PNG, JPG, WebP or GIF up to 4 MB.</p>{id && selected && <AdminGallery media={editedMedia ?? selected.product_media} disabled={busy || packageBusy} onChange={setEditedMedia} />}<label className="admin-media-upload">Add gallery image<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple disabled={busy || packageBusy} onChange={e => { chooseGallery(e.target.files); e.target.value=""; }} /></label>{pendingGallery.length>0 && <div className="admin-pending-gallery">{pendingGallery.map((file,index)=><p key={index}>{file.name} <button type="button" disabled={busy || packageBusy} onClick={()=>setPendingGallery(files=>files.filter((_,i)=>i!==index))}>Remove</button></p>)}</div>}</section><AdminToolPackage prepared={!!selected?.prepared_identity} kind={draft.product_type} productId={id} disabled={busy} tool={pendingTool} onToolChange={setPendingTool} ensureDraft={ensureToolDraft} onBusyChange={setPackageBusy} />{id && readOnly && draft.product_type === "tool" && !selected?.prepared_identity && <details><summary>Advanced ZIP replacement and download availability</summary><AdminDownloads key={id} productId={id} products={[{id,name:draft.name,slug:selected?.slug ?? draft.name,published:readOnly}]} /></details>}</div><div className="product-info admin-product-info"><form onSubmit={save}><fieldset disabled={busy || packageBusy || readOnly}><div className="admin-product-fields">
        <label>Title<input required readOnly={draft.product_type==="tool"} maxLength={80} value={draft.name} onChange={e => change("name",e.target.value)} placeholder="qatool01" /><small>{draft.product_type==="tool" ? "From the Houdini Asset Label. Tool identity is locked." : "Letters, numbers, spaces, underscores or hyphens. The slug is generated automatically."}</small></label>
        <label>Slug<input value={draft.slug ?? productSlug(draft.name)} readOnly /></label><label>Type<input value={draft.product_type} readOnly /></label>
        <label className="admin-product-wide">Subtitle<input maxLength={200} value={draft.subtitle} onChange={e => change("subtitle",e.target.value)} /></label>
        <label className="admin-product-wide">Description<textarea maxLength={20000} rows={10} value={draft.description} onChange={e => change("description",e.target.value)} /></label>
      {draft.product_type !== "tool" && <section className="admin-product-includes admin-product-wide"><h2>Included tools</h2>
        <details className="admin-bundle-filter"><summary className="menu-trigger">select tools ＋</summary><div className="dropdown filter-menu open filter-group admin-bundle-options">
          <div className="filter-label">TOOLS</div>{tools.map(t => <button key={t.id} type="button" className={"filter-option " + (pendingTools.includes(t.id) ? "selected" : "")} aria-pressed={pendingTools.includes(t.id)} onClick={() => setPendingTools(v => v.includes(t.id) ? v.filter(id => id !== t.id) : [...v,t.id])}>{t.name.toUpperCase()}</button>)}
          <button className="admin-bundle-add" type="button" onClick={event => { change("tool_ids",pendingTools); event.currentTarget.closest("details")?.removeAttribute("open"); }}>ADD</button></div>
        </details><div className="tags">{draft.tool_ids.map(id => <button key={id} type="button" className="filter-chip admin-included-tool" aria-label={"Remove " + catalog.products.find(t => t.id === id)?.name} onClick={() => { change("tool_ids",draft.tool_ids.filter(v => v !== id)); setPendingTools(v => v.filter(x => x !== id)); }}>{catalog.products.find(t => t.id === id)?.name} <span aria-hidden="true">×</span></button>)}</div>
        <p>Fixed product price; already-owned tools do not reduce it. Select published tools with enabled installers, then build the download before publishing.</p>
      </section>}
        <label>Price · EUR including tax<input type="text" inputMode="decimal" maxLength={9} value={priceText} onChange={e => {setPriceText(e.target.value);setDirty(true);setMessage(null);}} placeholder="0.00" /></label>
        <label>Version<input maxLength={40} value={draft.current_version} onChange={e => change("current_version",e.target.value)} /></label>
        <p>Release date is recorded when first published.</p>
        <label className="admin-product-wide">Compatibility<input maxLength={200} value={draft.compatibility} onChange={e => change("compatibility",e.target.value)} /></label>
        <label>Category<select value={draft.category_id || ""} onChange={e => change("category_id",Number(e.target.value))}><option value="">Choose category</option>{catalog.categories.filter(v => v.active || v.id === draft.category_id).map(v => <option key={v.id} value={v.id}>{v.name}{v.active ? "" : " (inactive)"}</option>)}</select></label>
        <label>Complexity<select value={draft.complexity_id || ""} onChange={e => change("complexity_id",Number(e.target.value))}><option value="">Choose complexity</option>{catalog.complexities.filter(v => v.active || v.id === draft.complexity_id).map(v => <option key={v.id} value={v.id}>{v.name}{v.active ? "" : " (inactive)"}</option>)}</select></label>
      </div>
      <div className="tags admin-product-selected-tags">{[catalog.categories.find(v => v.id === draft.category_id)?.name,catalog.complexities.find(v => v.id === draft.complexity_id)?.name].filter(Boolean).map((name,index) => <span key={index} className="card-tag">{name?.toUpperCase()}</span>)}</div>

      </fieldset><button type="submit" disabled={busy || packageBusy || (readOnly && !pendingArtwork && !pendingGallery.length && !editedMedia)}>{busy ? "Saving..." : id ? "Update product" : "Save unpublished draft"}</button></form></div></div>

      {id && !readOnly && <button type="button" disabled={busy || packageBusy} onClick={()=>void discardDraft()}>Delete unused draft</button>}
      {id && readOnly && <section><h2>Paddle price</h2><PriceEditor key={id} productId={id}/></section>}
      {id && !readOnly && <ProductPublication productId={id} updatedAt={updatedAt} disabled={dirty || busy || packageBusy || !!pendingArtwork || pendingGallery.length>0 || !!editedMedia} onPublished={()=>setRevision(v=>v+1)} />}

    </>}
  </section>;
}
