"use client";
import type { ProductContent } from "@/lib/productContent";
import ProductMediaPreview from "@/components/ProductMediaPreview";
import { productMediaAccept, productMediaFileHelp, validProductMediaFile } from "@/lib/productMediaInput";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
export type GalleryMedia={id:number;file_path:string|null;role:string;sort_order:number};
export type GalleryResult={id:number;updated_at:string;media:GalleryMedia[]};
export type PendingMedia=GalleryMedia & {file?:File;preview?:string};
export async function saveArtwork(productId:number,updatedAt:string,media:PendingMedia[] | null,content?:ProductContent):Promise<GalleryResult>{
 const session=await supabase.auth.getSession();if(session.error || !session.data.session)throw new Error("Please log in again.");
 const headers={Authorization:"Bearer "+session.data.session.access_token};
 const rows=[];
 for(const image of media ?? []){
  let path=image.file_path;
  if(image.file){
   const params=new URLSearchParams({productId:String(productId),expectedUpdatedAt:updatedAt});
   const response=await fetch("/api/admin/products/artwork?"+params,{method:"POST",headers:{...headers,"Content-Type":"application/octet-stream"},body:image.file});
   const result=await response.json();if(!response.ok)throw new Error(result.error ?? "Unable to prepare image.");path=result.path;
  }
  rows.push({id:image.id>0?image.id:null,role:image.role,path:path ?? ""});
 }
 const response=await fetch(content ? "/api/admin/products/content" : "/api/admin/products/artwork",{method:"PUT",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({productId,expectedUpdatedAt:updatedAt,media:media === null ? null : rows,...(content ? {content} : {})})});
 const result=await response.json();if(!response.ok)throw new Error(result.error ?? "Unable to update product images.");return result.gallery;
}
export default function AdminGallery({media,disabled,onChange}:{media:PendingMedia[];disabled:boolean;onChange:(media:PendingMedia[])=>void}){
 const [error,setError]=useState<string|null>(null),urls=useRef<string[]>([]);
 const [dragging, setDragging] = useState(false);
 useEffect(()=>()=>{urls.current.forEach(url=>URL.revokeObjectURL(url));},[]);
 const images=media.filter(m=>["gallery","detail"].includes(m.role)).sort((a,b)=>a.sort_order-b.sort_order || a.id-b.id);
 function replace(image:PendingMedia,file:File){
  if(!validProductMediaFile(file)){setError(productMediaFileHelp);return;}
  const preview=URL.createObjectURL(file);urls.current.push(preview);setError(null);onChange(media.map(m=>m.id===image.id?{...m,file,preview}:m));
 }
 function move(index:number,delta:number){const order=[...images],other=index+delta;[order[index],order[other]]=[order[other],order[index]];const positions=new Map(order.map((m,i)=>[m.id,i+1]));onChange(media.map(m=>positions.has(m.id)?{...m,sort_order:positions.get(m.id)!}:m));}
 function addFiles(selection: FileList | null) {
  if (disabled || !selection?.length) return;
  const files = Array.from(selection);
  const remaining = 9 - images.length;
  if (files.length > remaining) {
   setError(`The gallery holds up to 9 files. Choose up to ${remaining} more.`);
   return;
  }
  if (files.some(file => !validProductMediaFile(file))) {
   setError(productMediaFileHelp);
   return;
  }

  const lastId = Math.min(0, ...media.map(item => item.id));
  const lastPosition = Math.max(0, ...media.map(item => item.sort_order));
  const added = files.map((file, index) => {
   const preview = URL.createObjectURL(file);
   urls.current.push(preview);
   return { id: lastId - index - 1, file, preview, file_path: null, role: "gallery", sort_order: lastPosition + index + 1 };
  });
  setError(null);
  onChange([...media, ...added]);
 }
 return <div className="admin-gallery-editor"><fieldset disabled={disabled}>
  <div className="admin-media-grid">{images.map((image,index)=>{
   const url=image.preview ?? (image.file_path?supabase.storage.from("product-media").getPublicUrl(image.file_path).data.publicUrl:null);
   return <div key={image.id} className="admin-gallery-item"><label className="admin-gallery-replace">
    {url?<ProductMediaPreview src={url} alt={"Gallery preview "+(index+1)} width={640} height={360} file={image.file} />:<span>Gallery item {index+1}</span>}
    <input className="admin-gallery-file-input" type="file" accept={productMediaAccept} aria-label={"Replace gallery item "+(index+1)} onChange={event=>{const file=event.target.files?.[0];if(file)replace(image,file);event.target.value="";}} />
   </label><div className="admin-gallery-actions">
    <button type="button" disabled={index===0} aria-label={"Move gallery image "+(index+1)+" earlier"} onClick={()=>move(index,-1)}>←</button>
    <button type="button" disabled={index===images.length-1} aria-label={"Move gallery image "+(index+1)+" later"} onClick={()=>move(index,1)}>→</button>
    <button type="button" onClick={()=>onChange(media.filter(m=>m.id!==image.id))}>Remove</button>
   </div></div>;
  })}{images.length < 9 && <label className={`admin-gallery-add${dragging && !disabled ? " is-drag-over" : ""}`}
    onDragOver={event => {
      event.preventDefault();
      const canDrop = !disabled && event.dataTransfer.types.includes("Files");
      event.dataTransfer.dropEffect = canDrop ? "copy" : "none";
      setDragging(canDrop);
    }}
    onDragLeave={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
    }}
    onDrop={event => {
      event.preventDefault();
      setDragging(false);
      addFiles(event.dataTransfer.files);
    }}>
    <span aria-hidden="true">＋</span>
    <span>{dragging && !disabled ? "Drop files here" : "Add files"}</span>
    <input className="admin-gallery-file-input" type="file" accept={productMediaAccept} multiple aria-label="Add gallery files"
      onChange={event => { addFiles(event.currentTarget.files); event.currentTarget.value = ""; }} />
  </label>}</div>
 </fieldset>
 {error && <p role="alert" className="admin-product-error">{error}</p>}
 </div>;
}
