"use client";
import Image from "next/image";
import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
export type GalleryMedia={id:number;file_path:string|null;role:string;sort_order:number};
export type GalleryResult={id:number;updated_at:string;media:GalleryMedia[]};
export default function AdminGallery({productId,updatedAt,media,disabled,allowAdd,onUpdated,onBusyChange,onReload}:{productId:number;updatedAt:string;media:GalleryMedia[];disabled:boolean;allowAdd:boolean;onUpdated:(result:GalleryResult)=>void;onBusyChange:(value:boolean)=>void;onReload:()=>void}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[message,setMessage]=useState<string|null>(null);
 const running=useRef(false);
 const images=media.filter(m=>["gallery","detail"].includes(m.role)).sort((a,b)=>a.sort_order-b.sort_order || a.id-b.id);
 async function change(action:"add"|"replace"|"remove"|"reorder",imageId?:number,file?:File,order?:number[]) {
  if(disabled || running.current)return;
  running.current=true;setBusy(true);onBusyChange(true);setError(null);setMessage(null);
  try {
   const session=await supabase.auth.getSession();if(session.error || !session.data.session)throw new Error("Please log in again.");
   const headers:Record<string,string>={Authorization:"Bearer "+session.data.session.access_token};
   let url="/api/admin/products/gallery",method:string,body:BodyInit;
   if(action==="add" || action==="replace"){
    if(!file || file.size>4*1024*1024)throw new Error("Choose an image up to 4 MB.");
    if(!["image/png","image/jpeg","image/webp","image/gif"].includes(file.type))throw new Error("Choose a PNG, JPG, WebP or GIF image.");
    const params=new URLSearchParams({productId:String(productId),expectedUpdatedAt:updatedAt});if(imageId!==undefined)params.set("mediaId",String(imageId));
    url+="?"+params;method="POST";headers["Content-Type"]="application/octet-stream";body=file;
   }else{
    method=action==="remove"?"DELETE":"PATCH";headers["Content-Type"]="application/json";
    body=JSON.stringify({productId,expectedUpdatedAt:updatedAt,...(action==="remove"?{mediaId:imageId}:{mediaIds:order})});
   }
   const response=await fetch(url,{method,headers,body}),result=await response.json();if(!response.ok)throw new Error(result.error ?? "Unable to change gallery.");
   onUpdated(result.gallery);setMessage(result.message);
  }catch(reason){setError(reason instanceof Error?reason.message:"Unable to change gallery.");}
  finally{running.current=false;setBusy(false);onBusyChange(false);}
 }
 function move(index:number,delta:number){const order=images.map(m=>m.id),other=index+delta;[order[index],order[other]]=[order[other],order[index]];void change("reorder",undefined,undefined,order);}
 return <div className="admin-gallery-editor"><fieldset disabled={disabled || busy}>
  <div className="admin-media-grid">{images.map((image,index)=>{
   const url=image.file_path?supabase.storage.from("product-media").getPublicUrl(image.file_path).data.publicUrl:null;
   return <div key={image.id} className="admin-gallery-item"><label className="admin-gallery-replace">
    {url?<Image src={url} alt={"Gallery image "+(index+1)} width={640} height={360} unoptimized />:<span>Gallery image {index+1}</span>}
    <span>Replace image {index+1}</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label={"Replace gallery image "+(index+1)} onChange={event=>{const file=event.target.files?.[0];if(file)void change("replace",image.id,file);event.target.value="";}} />
   </label><div className="admin-gallery-actions">
    <button type="button" disabled={index===0} aria-label={"Move gallery image "+(index+1)+" earlier"} onClick={()=>move(index,-1)}>←</button>
    <button type="button" disabled={index===images.length-1} aria-label={"Move gallery image "+(index+1)+" later"} onClick={()=>move(index,1)}>→</button>
    <button type="button" onClick={()=>void change("remove",image.id)}>Remove</button>
   </div></div>;
  })}</div>
  {!images.length && <p>No gallery images yet.</p>}
  {allowAdd && <label className="admin-media-upload">Add gallery image<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={media.length>=20} onChange={event=>{const file=event.target.files?.[0];if(file)void change("add",undefined,file);event.target.value="";}} /></label>}
 </fieldset>{disabled && !busy && <p>Save or upload pending changes before editing saved gallery images.</p>}
 {busy && <p role="status">Saving gallery…</p>}{message && <p role="status">{message}</p>}
 {error && <p role="alert" className="admin-product-error">{error} <button type="button" disabled={busy || disabled} onClick={onReload}>Reload product</button></p>}
 </div>;
}
