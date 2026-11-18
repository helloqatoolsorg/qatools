"use client";
import Image from "next/image";
import ProductMediaPreview from "@/components/ProductMediaPreview";
import LoopingProductVideo from "@/components/LoopingProductVideo";
import { isWebmSource } from "@/lib/productMediaInput";
import {useCallback,useEffect,useRef,useState} from "react";
import {supabase} from "@/lib/supabase";
import {catalogProductTypes, productKindLabels} from "@/lib/productKind";
import {catalogProducts,productLabels,type AdminCatalog,type AdminProduct} from "@/lib/adminProductCatalog";
import type {DraftRecovery} from "@/lib/adminDraftRecovery";
import PublicationState from "./PublicationState";
export type AdminProductCardData = Pick<AdminProduct, "id" | "name" | "subtitle" | "price_eur" | "published" | "product_media">;
type ProductLinkHandler = React.MouseEventHandler<HTMLAnchorElement>;

function imageFor(product: Pick<AdminProduct, "product_media">) {
  const media = [...product.product_media].sort((a, b) => a.sort_order - b.sort_order);
  const image = media.find(item => item.role === "card") ?? media[0];
  return image?.file_path ? supabase.storage.from("product-media").getPublicUrl(image.file_path).data.publicUrl : null;
}

function productTags(labels: string[]) {
  return <div className="tags">{labels.map((label, index) =>
    <span className="card-tag" key={index + ":" + label}>{label.toUpperCase()}</span>
  )}</div>;
}

function productActions(product: Pick<AdminProduct, "id" | "published">, onOpen: ProductLinkHandler) {
  const editUrl = "/admin/products/edit?id=" + product.id;
  return <div className="admin-card-actions">
    <a className="admin-card-action" href={editUrl} onClick={onOpen}>Edit</a>
    {product.published
      ? <button className="admin-card-action admin-published-button" type="button" disabled>Published</button>
      : <a className="admin-card-action" href={editUrl + "&publish=1"} onClick={onOpen}>Publish</a>}
  </div>;
}

export function renderAdminProductCard(product: AdminProductCardData, labels: string[], onOpen: ProductLinkHandler) {
  const image = imageFor(product);
  return <article key={product.id} className="product-card admin-product-card">
    <a href={"/admin/products/edit?id=" + product.id} onClick={onOpen}>
      <div className="media-frame">
        {image ? <ProductMediaPreview src={image} alt={product.name} width={640} height={400} />
          : <div className="admin-product-artwork">No artwork</div>}
      </div>
      <div className="card-info">
        <h3 title={product.name}>{product.name}</h3>
        <p className="admin-card-subtitle">{product.subtitle}</p>
        {productTags(labels)}
        <p>{product.price_eur === null ? "Price not set" : "€" + Number(product.price_eur).toFixed(2)}</p>
      </div>
    </a>
    {productActions(product, onOpen)}
  </article>;
}

function RecoveryThumbnail({file}:{file:File}){
  const preview = useCallback((element: HTMLImageElement | HTMLVideoElement | null) => {
    if (!element) return;
    const url = URL.createObjectURL(file);
    element.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  if (isWebmSource("", file)) return <LoopingProductVideo ref={preview} aria-hidden="true" width={96} height={60} />;
  return <Image ref={preview} src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" alt="" width={96} height={60} unoptimized/>;
}
export default function AdminProductCatalog({catalog,recovery}:{catalog:AdminCatalog;recovery:DraftRecovery|null}){
  const [states,setStates]=useState<string[]>([]),[types,setTypes]=useState<string[]>([]),[query,setQuery]=useState(""),[sort,setSort]=useState("updated-desc"),[view,setView]=useState("cards");
  const filterRef=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{const close=(event:PointerEvent)=>{if(!filterRef.current?.contains(event.target as Node))filterRef.current?.removeAttribute("open");};const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")filterRef.current?.removeAttribute("open");};document.addEventListener("pointerdown",close);document.addEventListener("keydown",escape);return()=>{document.removeEventListener("pointerdown",close);document.removeEventListener("keydown",escape);};},[]);
  const products=catalogProducts(catalog.products,states,types,query,sort);
  const latest=catalogProducts(catalog.products,["unpublished"],[],"")[0];
  const resumeProduct=recovery?(recovery.id?catalog.products.find(p=>p.id===recovery.id):undefined):latest;
  const resumeTitle=recovery?.draft.name||resumeProduct?.name||"Untitled product";
  const resumeImage=resumeProduct?imageFor(resumeProduct):null;
  const resumeLink=recovery?"/admin/products/edit?resume=1":latest?"/admin/products/edit?id="+latest.id:null;
  const toggle=(value:string,list:string[],set:(v:string[])=>void)=>set(list.includes(value)?list.filter(v=>v!==value):[...list,value]);
  const guardEditing=(event:React.MouseEvent<HTMLAnchorElement>,product:AdminProduct)=>{if(recovery && recovery.id!==product.id && !window.confirm("Open another product? Save your unfinished product first if you want to keep editing both. Its local recovery copy will be replaced when you edit this product."))event.preventDefault();};
  return <section className="admin-products"><h2>Products</h2>
    <div className="admin-catalog-toolbar"><details ref={filterRef} className="admin-catalog-filter"><summary className="menu-trigger">filter ＋</summary><div className="dropdown filter-menu open">
      <div className="filter-group"><div className="filter-label">STATE</div>{["published","unpublished"].map(value=><button key={value} type="button" className={"filter-option "+(states.includes(value)?"selected":"")} aria-pressed={states.includes(value)} onClick={()=>toggle(value,states,setStates)}>{value.toUpperCase()}</button>)}</div>
      <div className="filter-group"><div className="filter-label">TYPE</div>{catalogProductTypes.map(value=><button key={value} type="button" className={"filter-option "+(types.includes(value)?"selected":"")} aria-pressed={types.includes(value)} onClick={()=>toggle(value,types,setTypes)}>{productKindLabels[value].toUpperCase()}</button>)}</div><button className="clear-filters" type="button" onClick={()=>{setStates([]);setTypes([]);}}>clear filters</button>
    </div></details><label>Search<input value={query} onChange={e=>setQuery(e.target.value)}/></label><label>Sort<select value={sort} onChange={e=>setSort(e.target.value)}><option value="updated-desc">Last saved · newest first</option><option value="updated-asc">Last saved · oldest first</option><option value="name">Name · A–Z</option></select></label><div className="admin-view-toggle" role="group" aria-label="Product view">{["cards","list"].map(value=><button key={value} type="button" aria-pressed={view===value} onClick={()=>setView(value)}>{value==="cards"?"Card view":"List view"}</button>)}</div></div>
    <div className="active-filter-chips">{states.map(value=><button type="button" key={value} className="filter-chip" onClick={()=>toggle(value,states,setStates)}>STATE: {value.toUpperCase()} ×</button>)}{types.map(value=><button type="button" key={value} className="filter-chip" onClick={()=>toggle(value,types,setTypes)}>TYPE: {productKindLabels[value as keyof typeof productKindLabels]?.toUpperCase() ?? value.toUpperCase()} ×</button>)}</div>
    <div className="admin-product-entry-actions"><a className="card admin-new-product" href="/admin/products/edit?new=1" onClick={event=>{if(recovery&&!window.confirm("Start a new product? This replaces the local recovery copy. Save your unfinished product first if you want to keep it."))event.preventDefault();}}>＋ New product</a>{resumeLink?<a className="card admin-new-product admin-resume-product" href={resumeLink}>{recovery?.mainFile?<RecoveryThumbnail file={recovery.mainFile}/>:resumeImage&&<ProductMediaPreview src={resumeImage} alt="" width={96} height={60}/>}<span>Continue editing<small>{resumeTitle}</small></span></a>:<button className="card admin-new-product" type="button" disabled>Continue editing</button>}</div>
    {view==="cards"?<div className="product-grid admin-product-grid">{products.map(product => renderAdminProductCard(product, productLabels(product, catalog), event => guardEditing(event, product)))}</div>:<div className="admin-product-table-scroll"><table className="admin-product-table"><thead><tr>{["Image","Name","Price","Tags","State","Last saved","Actions"].map(v=><th key={v} scope="col">{v}</th>)}</tr></thead><tbody>{products.map(p=>{const image=imageFor(p);return <tr key={p.id}><td><a href={"/admin/products/edit?id="+p.id} className="admin-list-thumbnail" onClick={event=>guardEditing(event,p)}>{image?<ProductMediaPreview src={image} alt={p.name} width={80} height={50}/>:<span>No artwork</span>}</a></td><td><a href={"/admin/products/edit?id="+p.id} onClick={event=>guardEditing(event,p)}>{p.name}</a></td><td>{p.price_eur===null?"Not set":"€"+Number(p.price_eur).toFixed(2)}</td><td>{productTags(productLabels(p,catalog))}</td><td><PublicationState published={p.published}/></td><td><time dateTime={p.updated_at}>{new Date(p.updated_at).toLocaleString()}</time></td><td>{productActions(p,event=>guardEditing(event,p))}</td></tr>;})}</tbody></table></div>}
    {!products.length&&<p>No products match these filters.</p>}
  </section>;
}
