import {randomUUID,createHash} from "node:crypto";
import {requireAdmin} from "@/lib/requireAdmin";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
import {privateJson} from "@/lib/activationHttp";
import {bundleTools} from "@/lib/bundlePackage";
import {buildHoudiniPackage,packageConfig} from "@/lib/houdiniPackage";
export const runtime="nodejs";
export async function POST(request:Request){
 try{
  const auth=await requireAdmin(request);if(auth.response){auth.response.headers.set("Cache-Control","no-store");return auth.response;}
  const params=new URL(request.url).searchParams,raw=params.get("productId")??"",id=Number(raw),expected=params.get("expectedPath");
  if(!/^[1-9][0-9]*$/.test(raw)||!Number.isSafeInteger(id)||expected===null||expected.length>512)return privateJson({error:"Choose a saved tool."},400);
  const product=await supabaseAdmin.from("products").select("id,slug,product_type,prepared_identity").eq("id",id).maybeSingle();
  const current=await supabaseAdmin.from("product_downloads").select("file_path,file_name,enabled").eq("product_id",id).maybeSingle();
  if(product.error||current.error)return privateJson({error:"Unable to verify tool ZIP."},503);
  if(product.data?.product_type!=="tool"||!current.data)return privateJson({error:"Upload this tool's ZIP before preparing its download."},409);
  if(current.data.file_path!==expected)return privateJson({error:"ZIP changed. Reload before updating."},409);
  if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,149}\.zip$/.test(current.data.file_name))return privateJson({error:"Check the current ZIP filename."},409);
  const bucket=await supabaseAdmin.storage.getBucket("qatools-downloads");if(bucket.error||bucket.data?.public!==false)return privateJson({error:"Private package storage unavailable."},503);
  const old=await supabaseAdmin.storage.from("qatools-downloads").download(expected);
  if(old.error||!old.data||old.data.size>5*1024*1024)return privateJson({error:"Unable to read current ZIP. Existing download retained."},503);
  const oldBytes=Buffer.from(await old.data.arrayBuffer()),tools=bundleTools(oldBytes,[{id,slug:product.data.slug}]),identity=product.data.prepared_identity;
  if(identity && (tools[0].name.toLowerCase()!==identity.file.toLowerCase()||createHash("sha256").update(tools[0].bytes).digest("hex")!==identity.sha256))return privateJson({error:"Stored HDA does not match this tool's identity."},409);
  const bytes=await buildHoudiniPackage(Buffer.from(JSON.stringify(packageConfig)),tools);
  if(bytes.equals(oldBytes)&&current.data.enabled)return privateJson({download:current.data,unchanged:true});
  const path=id+"/"+randomUUID()+"/"+current.data.file_name;
  const upload=await supabaseAdmin.storage.from("qatools-downloads").upload(path,bytes,{contentType:"application/zip",upsert:false});
  if(upload.error)return privateJson({error:"Unable to build download. Existing ZIP retained."},503);
  const saved=await supabaseAdmin.rpc("set_product_download",{p_admin_id:auth.user.id,p_product_id:id,p_expected_path:expected,p_file_path:path,p_file_name:current.data.file_name,p_enabled:true});
  if(saved.error||!saved.data?.ok)return privateJson({error:"ZIP changed during update. Reload before trying again."},409);
  return privateJson({download:{file_name:current.data.file_name,file_path:path,enabled:true}});
 }catch{return privateJson({error:"Unable to rebuild this tool ZIP. Existing download retained."},503);}
}
