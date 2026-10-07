import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { privateJson, readActivationBody } from "@/lib/activationHttp";
import { imageFormat } from "@/lib/productMedia";
export const runtime = "nodejs";
const validId = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const validStamp = (value: unknown): value is string => typeof value === "string" && value.length < 64 && Number.isFinite(Date.parse(value));

export async function POST(request: Request) {
 try {
  const auth=await requireAdmin(request);if(auth.response){auth.response.headers.set("Cache-Control","no-store");return auth.response;}
  const params=new URL(request.url).searchParams,rawId=params.get("productId") ?? "",rawMedia=params.get("mediaId"),stamp=params.get("expectedUpdatedAt");
  if(!/^[1-9][0-9]*$/.test(rawId) || !validId(Number(rawId)) || !validStamp(stamp) || (rawMedia!==null && (!/^[1-9][0-9]*$/.test(rawMedia) || !validId(Number(rawMedia)))))return privateJson({error:"Choose a saved product and reload its gallery."},400);
  const productId=Number(rawId),mediaId=rawMedia===null?null:Number(rawMedia);
  const product=await supabaseAdmin.from("products").select("id,updated_at").eq("id",productId).maybeSingle();
  if(product.error)return privateJson({error:"Unable to verify product."},503);
  // SQL compares timestamps exactly; this early check avoids unnecessary uploads.
  if(!product.data || Date.parse(product.data.updated_at)!==Date.parse(stamp))return privateJson({error:"This product changed. Reload before editing the gallery."},409);
  const reader=request.body?.getReader();if(!reader)return privateJson({error:"Choose an image."},400);
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>4*1024*1024){await reader.cancel();return privateJson({error:"Choose an image up to 4 MB."},413);}chunks.push(part.value);}}finally{reader.releaseLock();}
  const bytes=Buffer.concat(chunks),format=imageFormat(bytes);if(!format)return privateJson({error:"Choose a PNG, JPG, WebP or GIF image."},400);
  const bucket=await supabaseAdmin.storage.getBucket("product-media");if(bucket.error || bucket.data?.public!==true)return privateJson({error:"Product media storage is unavailable."},503);
  const path="drafts/"+productId+"/"+randomUUID()+"."+format;
  const uploaded=await supabaseAdmin.storage.from("product-media").upload(path,bytes,{contentType:"image/"+(format==="jpg"?"jpeg":format),upsert:false});
  if(uploaded.error)return privateJson({error:"Unable to upload image."},503);
  const result=await supabaseAdmin.rpc("manage_product_gallery",{p_admin_id:auth.user.id,p_product_id:productId,p_expected_updated_at:stamp,p_action:mediaId===null?"add":"replace",p_media_id:mediaId,p_path:path});
  // Keep an unreferenced upload on ambiguous database failures. Deleting it could
  // break a successful commit whose response was interrupted. Old images remain.
  if(result.error || !result.data)return privateJson({error:"Unable to save image. Reload the gallery and check its media limit."},409);
  return privateJson({gallery:result.data,message:mediaId===null?"Gallery image added.":"Gallery image replaced."});
 }catch{return privateJson({error:"Unable to update gallery."},503);}
}

async function edit(request:Request,action:"remove"|"reorder") {
 try {
  const auth=await requireAdmin(request);if(auth.response){auth.response.headers.set("Cache-Control","no-store");return auth.response;}
  const body=await readActivationBody(request,2048),keys=action==="remove"?["productId","expectedUpdatedAt","mediaId"]:["productId","expectedUpdatedAt","mediaIds"];
  if(!body || Object.keys(body).length!==3 || Object.keys(body).some(k=>!keys.includes(k)) || !validId(body.productId) || !validStamp(body.expectedUpdatedAt)
    || (action==="remove" ? !validId(body.mediaId) : !Array.isArray(body.mediaIds) || body.mediaIds.length>20 || body.mediaIds.some(id=>!validId(id)) || new Set(body.mediaIds).size!==body.mediaIds.length))return privateJson({error:"Choose valid gallery images and reload the product."},400);
  const result=await supabaseAdmin.rpc("manage_product_gallery",{p_admin_id:auth.user.id,p_product_id:body.productId,p_expected_updated_at:body.expectedUpdatedAt,p_action:action,...(action==="remove"?{p_media_id:Number(body.mediaId)}:{p_media_ids:body.mediaIds as number[]})});
  if(result.error || !result.data)return privateJson({error:"The gallery changed or the image is unavailable. Reload before editing."},409);
  return privateJson({gallery:result.data,message:action==="remove"?"Gallery image removed.":"Gallery order saved."});
 }catch{return privateJson({error:"Unable to update gallery."},503);}
}
export async function PATCH(request:Request){return edit(request,"reorder");}
export async function DELETE(request:Request){return edit(request,"remove");}
