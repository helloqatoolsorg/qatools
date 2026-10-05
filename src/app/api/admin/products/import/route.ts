import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/requireAdmin";
import { privateJson } from "@/lib/activationHttp";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { preparedTool } from "@/lib/preparedTool";
import { buildHoudiniPackage, packageConfig } from "@/lib/houdiniPackage";
export const runtime="nodejs";
export async function POST(request:Request) {
 try {
  const auth=await requireAdmin(request);if(auth.response){auth.response.headers.set("Cache-Control","no-store");return auth.response;}
  const requestId=new URL(request.url).searchParams.get("requestId");
  if(!requestId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId))return privateJson({error:"Invalid import request."},400);
  const reader=request.body?.getReader();if(!reader)return privateJson({error:"Choose a prepared tool ZIP."},400);
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>5*1024*1024){await reader.cancel();return privateJson({error:"Prepared ZIP must be smaller than 5 MB."},413);}chunks.push(p.value);}}finally{reader.releaseLock();}
  let prepared;
  try{prepared=preparedTool(Buffer.concat(chunks));}catch(reason){return privateJson({error:reason instanceof Error?reason.message:"Invalid prepared ZIP."},400);}
  const bucket=await supabaseAdmin.storage.getBucket("qatools-downloads");
  if(bucket.error || bucket.data?.public!==false)return privateJson({error:"Private package storage is unavailable. No draft was created."},503);
  const bytes=await buildHoudiniPackage(Buffer.from(JSON.stringify(packageConfig)),[prepared.tool]);
  const imported=await supabaseAdmin.rpc("import_prepared_tool",{p_admin_id:auth.user.id,p_request_id:requestId,p_identity:prepared.identity});
  if(imported.error || !imported.data){
   if(imported.error?.code==="23505"){
    const existing=await supabaseAdmin.from("products").select("id,name,published").eq("slug",prepared.identity.slug).maybeSingle();
    if(!existing.error && existing.data)return privateJson({error:"This tool already has a product. Open its existing draft or product.",existingProduct:existing.data},409);
   }
   return privateJson({error:imported.error?.code==="40001"?"This import changed. Reload before trying again.":"Unable to create the tool draft. Check that the prepared-tool migration is applied."},409);
  }
  const draft=imported.data;
  const current=await supabaseAdmin.from("product_downloads").select("file_path,enabled").eq("product_id",draft.id).maybeSingle();
  const incomplete=(error:string)=>privateJson({error,draft},503);
  if(current.error)return incomplete("Draft created, but its installer could not be checked. Retry the same ZIP or open the draft.");
  if(current.data?.file_path)return privateJson({draft,message:"Prepared tool imported. Complete its details before publishing."});
  const fileName=prepared.identity.slug+"-houdini22.zip",path=draft.id+"/"+randomUUID()+"/"+fileName;
  const uploaded=await supabaseAdmin.storage.from("qatools-downloads").upload(path,bytes,{contentType:"application/zip",upsert:false});
  if(uploaded.error)return incomplete("Draft created, but the installer upload failed. Retry this ZIP; the same draft will be used.");
  const mapped=await supabaseAdmin.rpc("set_product_download",{p_admin_id:auth.user.id,p_product_id:draft.id,p_expected_path:null,p_file_path:path,p_file_name:fileName,p_enabled:true});
  if(mapped.error || !mapped.data?.ok){
   await supabaseAdmin.storage.from("qatools-downloads").remove([path]);
   return incomplete("Draft created, but the installer could not be attached. Retry the same ZIP.");
  }
  return privateJson({draft,message:"Prepared tool imported. Complete its details before publishing."});
 }catch{return privateJson({error:"Unable to import prepared tool. Retry with the same file."},503);}
}
