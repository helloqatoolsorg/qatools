"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
export type GalleryMedia={id:number;file_path:string|null;role:string;sort_order:number};
export type GalleryResult={id:number;updated_at:string;media:GalleryMedia[]};
export type PendingMedia=GalleryMedia & {file?:File;preview?:string};
export async function saveArtwork(productId:number,updatedAt:string,media:PendingMedia[]):Promise<GalleryResult>{
 const session=await supabase.auth.getSession();if(session.error || !session.data.session)throw new Error("Please log in again.");
 const headers={Authorization:"Bearer "+session.data.session.access_token};
 const rows=[];
 for(const image of media){
  let path=image.file_path;
  if(image.file){
   const params=new URLSearchParams({productId:String(productId),expectedUpdatedAt:updatedAt});
   const response=await fetch("/api/admin/products/artwork?"+params,{method:"POST",headers:{...headers,"Content-Type":"application/octet-stream"},body:image.file});
   const result=await response.json();if(!response.ok)throw new Error(result.error ?? "Unable to prepare image.");path=result.path;
  }
  rows.push({id:image.id>0?image.id:null,role:image.role,path:path ?? ""});
 }
 const response=await fetch("/api/admin/products/artwork",{method:"PUT",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({productId,expectedUpdatedAt:updatedAt,media:rows})});
 const result=await response.json();if(!response.ok)throw new Error(result.error ?? "Unable to update product images.");return result.gallery;
}
export default function AdminGallery({media,disabled,onChange}:{media:PendingMedia[];disabled:boolean;onChange:(media:PendingMedia[])=>void}){
 const [error,setError]=useState<string|null>(null),urls=useRef<string[]>([]);
 useEffect(()=>()=>{urls.current.forEach(url=>URL.revokeObjectURL(url));},[]);
 const images=media.filter(m=>["gallery","detail"].includes(m.role)).sort((a,b)=>a.sort_order-b.sort_order || a.id-b.id);
 function replace(image:PendingMedia,file:File){
  if(file.size>4*1024*1024 || !["image/png","image/jpeg","image/webp","image/gif"].includes(file.type)){setError("Choose a PNG, JPG, WebP or GIF up to 4 MB.");return;}
  const preview=URL.createObjectURL(file);urls.current.push(preview);setError(null);onChange(media.map(m=>m.id===image.id?{...m,file,preview}:m));
 }
 function move(index:number,delta:number){const order=[...images],other=index+delta;[order[index],order[other]]=[order[other],order[index]];const positions=new Map(order.map((m,i)=>[m.id,i+1]));onChange(media.map(m=>positions.has(m.id)?{...m,sort_order:positions.get(m.id)!}:m));}
 return <div className="admin-gallery-editor"><fieldset disabled={disabled}>
  <div className="admin-media-grid">{images.map((image,index)=>{
   const url=image.preview ?? (image.file_path?supabase.storage.from("product-media").getPublicUrl(image.file_path).data.publicUrl:null);
   return <div key={image.id} className="admin-gallery-item"><label className="admin-gallery-replace">
    {url?<Image src={url} alt={"Gallery image "+(index+1)} width={640} height={360} unoptimized />:<span>Gallery image {index+1}</span>}
    <span>Replace image {index+1}</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label={"Replace gallery image "+(index+1)} onChange={event=>{const file=event.target.files?.[0];if(file)replace(image,file);event.target.value="";}} />
   </label><div className="admin-gallery-actions">
    <button type="button" disabled={index===0} aria-label={"Move gallery image "+(index+1)+" earlier"} onClick={()=>move(index,-1)}>←</button>
    <button type="button" disabled={index===images.length-1} aria-label={"Move gallery image "+(index+1)+" later"} onClick={()=>move(index,1)}>→</button>
    <button type="button" onClick={()=>onChange(media.filter(m=>m.id!==image.id))}>Remove</button>
   </div></div>;
  })}</div>
  {!images.length && <p>No gallery images yet.</p>}
 </fieldset><p>Image changes apply when you click Update product.</p>
 {error && <p role="alert" className="admin-product-error">{error}</p>}
 </div>;
}
