import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { privateJson, readActivationBody } from "@/lib/activationHttp";
import { productMediaFormat } from "@/lib/productMedia";
export const runtime="nodejs";
const id=(v:unknown):v is number=>typeof v==="number" && Number.isSafeInteger(v) && v>0;
const stamp=(v:unknown):v is string=>typeof v==="string" && v.length<64 && Number.isFinite(Date.parse(v));
// Upload into a new path without changing the product. PUT binds all references atomically.
export async function POST(request:Request){
 try{
  const auth=await requireAdmin(request);if(auth.response){auth.response.headers.set("Cache-Control","no-store");return auth.response;}
  const params=new URL(request.url).searchParams,raw=params.get("productId") ?? "",version=params.get("expectedUpdatedAt");
  if(!/^[1-9][0-9]*$/.test(raw) || !id(Number(raw)) || !stamp(version))return privateJson({error:"Reload the product before updating images."},400);
  const product=await supabaseAdmin.from("products").select("id,updated_at").eq("id",Number(raw)).maybeSingle();
  if(product.error)return privateJson({error:"Unable to verify product."},503);
  if(!product.data || Date.parse(product.data.updated_at)!==Date.parse(version))return privateJson({error:"This product changed. Reload before updating it."},409);
  const reader=request.body?.getReader();if(!reader)return privateJson({error:"Choose a media file."},400);
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>4*1024*1024){await reader.cancel();return privateJson({error:"Choose a media file up to 4 MB."},413);}chunks.push(part.value);}}finally{reader.releaseLock();}
  const bytes=Buffer.concat(chunks),format=productMediaFormat(bytes);if(!format)return privateJson({error:"Choose a WebM video, PNG, JPG, WebP or GIF."},400);
  const bucket=await supabaseAdmin.storage.getBucket("product-media");if(bucket.error || bucket.data?.public!==true)return privateJson({error:"Product media storage is unavailable."},503);
  const path="drafts/"+raw+"/"+randomUUID()+"."+format.extension;
  const upload=await supabaseAdmin.storage.from("product-media").upload(path,bytes,{contentType:format.contentType,upsert:false});
  if(upload.error)return privateJson({error:"Unable to upload media."},503);
  return privateJson({path});
 }catch{return privateJson({error:"Unable to prepare media."},503);}
}
export async function PUT(request:Request){
 try{
  const auth=await requireAdmin(request);if(auth.response){auth.response.headers.set("Cache-Control","no-store");return auth.response;}
  const body=await readActivationBody(request,8192);
  if(!body || Object.keys(body).length!==3 || !id(body.productId) || !stamp(body.expectedUpdatedAt) || !Array.isArray(body.media) || (body.media.length>11 || body.media.filter(m=>m && ["gallery","detail"].includes(m.role)).length>9) || body.media.some(m=>!m || typeof m!=="object" || Object.keys(m).length!==3 || !(m.id===null || id(m.id)) || !["card","main","gallery","detail"].includes(m.role) || typeof m.path!=="string" || m.path.length>512))return privateJson({error:"Choose valid product images."},400);
  const result=await supabaseAdmin.rpc("save_product_artwork",{p_admin_id:auth.user.id,p_product_id:body.productId,p_expected_updated_at:body.expectedUpdatedAt,p_media:body.media});
  if(result.error || !result.data)return privateJson({error:"Product changed or images are unavailable. Reload and check before retrying."},409);
  return privateJson({gallery:result.data,message:"Product media updated."});
 }catch{return privateJson({error:"Unable to update product images."},503);}
}
