"use client";
import { useEffect, useRef, useState } from "react";
import { PriceEditor } from "@/components/AdminPrices";
import { supabase } from "@/lib/supabase";
type Checks={ready:boolean;missing:string[];updated_at:string};
async function request(url:string,body?:object){const session=await supabase.auth.getSession();if(session.error||!session.data.session)throw new Error("Please log in again.");const r=await fetch(url,{cache:"no-store",method:body?"PATCH":"GET",headers:{Authorization:"Bearer "+session.data.session.access_token,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw new Error(data.error??"Unable to publish product.");return data;}
export default function ProductPublication({productId,updatedAt,disabled,onPublished}:{productId:number;updatedAt:string|null;disabled:boolean;onPublished:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[checks,setChecks]=useState<Checks|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 async function check(){setBusy(true);setError(null);try{setChecks(await request("/api/admin/products/readiness?productId="+productId));}catch(reason){setError(reason instanceof Error?reason.message:"Unable to check product.");}finally{setBusy(false);}}
 useEffect(()=>{if(new URLSearchParams(window.location.search).get("publish")==="1")dialog.current?.showModal();},[]);
 async function publish(){if(busy||disabled||!checks?.ready)return;setBusy(true);setError(null);try{await request("/api/admin/products",{productId,expectedUpdatedAt:updatedAt});dialog.current?.close();onPublished();}catch(reason){setError(reason instanceof Error?reason.message:"Unable to publish product.");}finally{setBusy(false);}}
 return <section className="admin-product-publication"><h2>Publication</h2><button type="button" className="admin-card-action" disabled={disabled} onClick={()=>{dialog.current?.showModal();void check();}}>Publish</button>
 <dialog ref={dialog} className="admin-publication-dialog"><h2>Prepare publication</h2><p>Save the draft, check its files and verify its price before publishing.</p>
 <PriceEditor key={productId} productId={productId}/><button type="button" disabled={busy||disabled} onClick={check}>Check readiness</button>
 {checks&&<>{checks.ready?<p role="status">All publication requirements are ready.</p>:<><p>Missing requirements:</p><ul>{checks.missing.map(v=><li key={v}>{v}</li>)}</ul></>}</>}
 {error&&<p role="alert" className="admin-product-error">{error}</p>}<div className="admin-publication-actions"><button type="button" disabled={busy||disabled||!checks?.ready} onClick={publish}>{busy?"Checking…":"Publish product"}</button><button type="button" disabled={busy} onClick={()=>dialog.current?.close()}>Close</button></div></dialog></section>;
}
