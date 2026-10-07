import { randomUUID, createHash } from "node:crypto";
import { requireAdmin } from "@/lib/requireAdmin";
import { privateJson } from "@/lib/activationHttp";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildHoudiniPackage, packageConfig } from "@/lib/houdiniPackage";
import { bundleTools } from "@/lib/bundlePackage";
import { buildProjectPackage, PROJECT_UPLOAD_LIMIT, validateProjectArchive } from "@/lib/projectArchive";
export const runtime = "nodejs";
export async function POST(request: Request) {
 try {
  const auth = await requireAdmin(request); if (auth.response) { auth.response.headers.set("Cache-Control","no-store"); return auth.response; }
  const params=new URL(request.url).searchParams, raw=params.get("productId") ?? "", expected=params.get("expectedPath");
  if(!/^[1-9][0-9]*$/.test(raw) || !Number.isSafeInteger(Number(raw)) || expected===null || expected.length>512)return privateJson({error:"Choose a saved bundle or project."},400);
  const id=Number(raw), product=await supabaseAdmin.from("products").select("id,slug,product_type,published").eq("id",id).maybeSingle();
  if(product.error)return privateJson({error:"Unable to load product."},503);
  if(!product.data || !["bundle","project"].includes(product.data.product_type))return privateJson({error:"Choose a bundle or project."},409);
  const isProject = product.data.product_type === "project";
  let projectBytes: Buffer | null = null;
  if (isProject) {
   const contentType = request.headers.get("content-type");
   if (!contentType?.startsWith("multipart/form-data;")) return privateJson({error:"Upload a project ZIP."},400);
   const reader=request.body?.getReader(); if(!reader)return privateJson({error:"Upload a project ZIP."},400);
   const chunks:Uint8Array[]=[];let size=0;
   try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>PROJECT_UPLOAD_LIMIT+8192){await reader.cancel();return privateJson({error:"Project ZIP must be smaller than 4 MB."},413);}chunks.push(part.value);}}finally{reader.releaseLock();}
   let form:FormData;
   try{form=await new Request("http://localhost",{method:"POST",headers:{"Content-Type":contentType},body:Buffer.concat(chunks)}).formData();}catch{return privateJson({error:"Invalid project upload."},400);}
   const file=form.get("tool");
   if(!(file instanceof File) || !/\.zip$/i.test(file.name) || form.getAll("tool").length!==1 || [...form.keys()].some(k=>k!=="tool"))return privateJson({error:"Upload one project ZIP."},400);
   projectBytes=Buffer.from(await file.arrayBuffer());
   try{validateProjectArchive(projectBytes);}catch(reason){return privateJson({error:reason instanceof Error ? reason.message:"Invalid project ZIP."},400);}
  } else {
  // Servers may represent an empty POST as a non-null stream. Reject bytes,
  // not the presence of a stream; the selection comes only from saved metadata.
  const reader=request.body?.getReader();
  if(reader){
   try{while(true){const part=await reader.read();if(part.done)break;if(part.value.byteLength){await reader.cancel();return privateJson({error:"Bundle assembly does not accept uploaded content."},400);}}}
   finally{reader.releaseLock();}
  }
  }
  const current=await supabaseAdmin.from("product_downloads").select("file_path").eq("product_id",id).maybeSingle();
  if(current.error)return privateJson({error:"Unable to verify current installer."},503);
  if((current.data?.file_path ?? "")!==expected)return privateJson({error:"The download changed. Reload before building."},409);
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
   if(!mapping?.enabled || !mapping.file_path.startsWith(tool.id+"/"))return privateJson({error:"Upload and enable an installer for "+tool.slug+" before building the download."},409);
   const file=await supabaseAdmin.storage.from("qatools-downloads").download(mapping.file_path);
   if(file.error || !file.data)return privateJson({error:"Unable to read installer for "+tool.slug+". Existing download retained."},503);
   if(file.data.size>5*1024*1024 || (total+=file.data.size)>25*1024*1024)return privateJson({error:"Selected installers exceed the 25 MB package limit."},413);
   try {
    const extracted=bundleTools(Buffer.from(await file.data.arrayBuffer()),[{id:tool.id,slug:tool.slug}]);
    const identity=tool.prepared_identity;
    if(identity && (extracted[0].name!==identity.file || createHash("sha256").update(extracted[0].bytes).digest("hex")!==identity.sha256))throw Error("Prepared identity mismatch");
    tools.push(...extracted);
   }catch{return privateJson({error:"The installer for "+tool.slug+" does not match its tool. Replace it before building the download."},409);}
   sources.push({tool_id:tool.id,file_path:mapping.file_path});
  }
  let bytes:Buffer;
  try{bytes=isProject ? await buildProjectPackage(product.data.slug,projectBytes!,tools) : await buildHoudiniPackage(Buffer.from(JSON.stringify(packageConfig)),tools);}catch{return privateJson({error:"Unable to combine these installers. Check duplicate filenames and the 25 MB package limit."},409);}
  const fileName=product.data.slug+"-houdini22.zip";
  if(!/^[a-z0-9][a-z0-9_-]{0,79}-houdini22\.zip$/.test(fileName))return privateJson({error:"Check the product identifier."},400);
  const path=id+"/"+randomUUID()+"/"+fileName;
  const upload=await supabaseAdmin.storage.from("qatools-downloads").upload(path,bytes,{contentType:"application/zip",upsert:false});
  if(upload.error)return privateJson({error:"Unable to save download. Existing installer retained."},503);
  const args={p_admin_id:auth.user.id,p_product_id:id,p_expected_path:expected || null,p_file_path:path,p_file_name:fileName,p_sources:sources};
  const saved=isProject ? await supabaseAdmin.rpc("set_assembled_project_download",{...args,p_project_sha256:createHash("sha256").update(projectBytes!).digest("hex")}) : await supabaseAdmin.rpc("set_assembled_bundle_download",args);
  if(saved.error || !saved.data?.ok)return privateJson({error:"The selection or a source installer changed during the build. Existing download retained. Reload and rebuild."},409);
  return privateJson({message:isProject ? "Project download built with the selected tools and a separate project ZIP. Install the qatools package, then extract the project ZIP into your working folder. Re-upload the project ZIP when rebuilding." : "Bundle installer built from the selected tools. It includes one qatools.json and shared licensing files. Rebuild to include future tool updates.",download:{file_name:fileName,file_path:path,enabled:true}});
 }catch{return privateJson({error:"Unable to assemble download. Existing installer retained."},503);}
}
