import { randomUUID, createHash } from "node:crypto";
import { requireAdmin } from "@/lib/requireAdmin";
import { privateJson } from "@/lib/activationHttp";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildHoudiniPackage, packageConfig } from "@/lib/houdiniPackage";
import { bundleTools } from "@/lib/bundlePackage";
export const runtime = "nodejs";
export async function POST(request: Request) {
 try {
  const auth = await requireAdmin(request); if (auth.response) { auth.response.headers.set("Cache-Control","no-store"); return auth.response; }
  const params=new URL(request.url).searchParams, raw=params.get("productId") ?? "", expected=params.get("expectedPath");
  if(!/^[1-9][0-9]*$/.test(raw) || !Number.isSafeInteger(Number(raw)) || expected===null || expected.length>512)return privateJson({error:"Choose a saved bundle."},400);
  // Servers may represent an empty POST as a non-null stream. Reject bytes,
  // not the presence of a stream; the selection comes only from saved metadata.
  const reader=request.body?.getReader();
  if(reader){
   try{while(true){const part=await reader.read();if(part.done)break;if(part.value.byteLength){await reader.cancel();return privateJson({error:"Bundle assembly does not accept uploaded content."},400);}}}
   finally{reader.releaseLock();}
  }
  const id=Number(raw), product=await supabaseAdmin.from("products").select("id,slug,product_type,published").eq("id",id).maybeSingle();
  if(product.error)return privateJson({error:"Unable to load bundle."},503);
  if(!product.data || product.data.product_type!=="bundle")return privateJson({error:"Choose a bundle."},409);
  const current=await supabaseAdmin.from("product_downloads").select("file_path").eq("product_id",id).maybeSingle();
  if(current.error)return privateJson({error:"Unable to verify current installer."},503);
  if((current.data?.file_path ?? "")!==expected)return privateJson({error:"The bundle installer changed. Reload before building."},409);
  const bucket=await supabaseAdmin.storage.getBucket("qatools-downloads");
  if(bucket.error || bucket.data?.public!==false)return privateJson({error:"Private package storage is unavailable."},503);
  const members=await supabaseAdmin.from("product_members").select("tool_id").eq("product_id",id);
  if(members.error)return privateJson({error:"Unable to load included tools."},503);
  if(!members.data?.length || members.data.length>100)return privateJson({error:"Select and save the included tools first."},409);
  const ids=members.data.map(m=>m.tool_id).sort((a,b)=>a-b);
  const selected=await supabaseAdmin.from("products").select("id,slug,product_type,published,prepared_identity").in("id",ids);
  if(selected.error)return privateJson({error:"Unable to load included tools."},503);
  if(selected.data?.length!==ids.length || selected.data.some(t=>t.product_type!=="tool" || !t.published))return privateJson({error:"Every included tool must be a published individual tool."},409);
  const mappings=await supabaseAdmin.from("product_downloads").select("product_id,file_path,enabled").in("product_id",ids);
  if(mappings.error)return privateJson({error:"Unable to verify tool installers."},503);
  const tools:{name:string;bytes:Buffer}[]=[], sources:{tool_id:number;file_path:string}[]=[];let total=0;
  for(const tool of [...selected.data].sort((a,b)=>a.id-b.id)) {
   const mapping=mappings.data?.find(d=>d.product_id===tool.id);
   if(!mapping?.enabled || !mapping.file_path.startsWith(tool.id+"/"))return privateJson({error:"Upload and enable an installer for "+tool.slug+" before building the bundle."},409);
   const file=await supabaseAdmin.storage.from("qatools-downloads").download(mapping.file_path);
   if(file.error || !file.data)return privateJson({error:"Unable to read installer for "+tool.slug+". Existing bundle retained."},503);
   if(file.data.size>5*1024*1024 || (total+=file.data.size)>25*1024*1024)return privateJson({error:"Selected installers exceed the bundle build limits."},413);
   try {
    const extracted=bundleTools(Buffer.from(await file.data.arrayBuffer()),[{id:tool.id,slug:tool.slug}]);
    const identity=tool.prepared_identity;
    if(identity && (extracted[0].name!==identity.file || createHash("sha256").update(extracted[0].bytes).digest("hex")!==identity.sha256))throw Error("Prepared identity mismatch");
    tools.push(...extracted);
   }catch{return privateJson({error:"The installer for "+tool.slug+" does not match its tool. Replace it before building the bundle."},409);}
   sources.push({tool_id:tool.id,file_path:mapping.file_path});
  }
  let bytes:Buffer;
  try{bytes=await buildHoudiniPackage(Buffer.from(JSON.stringify(packageConfig)),tools);}catch{return privateJson({error:"Unable to combine these installers. Check duplicate filenames and the 25 MB package limit."},409);}
  const fileName=product.data.slug+"-houdini22.zip";
  if(!/^[a-z0-9][a-z0-9_-]{0,79}-houdini22\.zip$/.test(fileName))return privateJson({error:"Check the bundle identifier."},400);
  const path=id+"/"+randomUUID()+"/"+fileName;
  const upload=await supabaseAdmin.storage.from("qatools-downloads").upload(path,bytes,{contentType:"application/zip",upsert:false});
  if(upload.error)return privateJson({error:"Unable to save bundle. Existing installer retained."},503);
  const saved=await supabaseAdmin.rpc("set_assembled_bundle_download",{p_admin_id:auth.user.id,p_product_id:id,p_expected_path:expected || null,p_file_path:path,p_file_name:fileName,p_sources:sources});
  if(saved.error || !saved.data?.ok)return privateJson({error:"The selection or a source installer changed during the build. Existing bundle retained. Reload and rebuild."},409);
  return privateJson({message:"Bundle installer built from the selected tools. It includes one qatools.json and shared licensing files. Rebuild to include future tool updates.",download:{file_name:fileName,file_path:path,enabled:true}});
 }catch{return privateJson({error:"Unable to assemble bundle. Existing installer retained."},503);}
}
