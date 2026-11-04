"use client";
import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";
import AdminProjectPackage from "./AdminProjectPackage";
export async function savePendingInstaller(id:number,kind:"tool"|"bundle"|"project",file:File|null){
 const session=await supabase.auth.getSession();if(!session.data.session)throw Error("Please log in again.");
 const headers={Authorization:"Bearer "+session.data.session.access_token};
 const current=await fetch("/api/admin/downloads?productId="+id,{headers,cache:"no-store"});const previous=await current.json();if(!current.ok)throw Error(previous.error??"Unable to read current ZIP.");
 if(!file && kind==="tool" && !previous.download)return null;
 if(file && kind!=="project" && previous.download?.file_name && file.name!==previous.download.file_name)throw Error("Replacement filename must be exactly "+previous.download.file_name);
 const params=new URLSearchParams({productId:String(id),expectedPath:previous.download?.file_path??""});
 const body=new FormData();if(file)body.set("tool",file);
 const response=await fetch("/api/admin/products/"+(!file && kind==="tool"?"rebuild":file && kind!=="project"?"package":"assemble")+"?"+params,{method:"POST",headers,...(file?{body}:{})});
 const result=await response.json();if(!response.ok)throw Error(result.error??"Unable to prepare download. Existing ZIP retained.");return result;
}
type Props={productId:number|null;disabled:boolean;onBusyChange:(busy:boolean)=>void;tool:File|null;onToolChange:(file:File|null)=>void;ensureDraft:()=>Promise<number>;kind?:"tool"|"bundle"|"project";prepared?:boolean};
export default function AdminToolPackage(props:Props){return props.kind==="project"?<AdminProjectPackage {...props}/>:<InstallerSummary {...props}/>;}
function InstallerSummary({productId,disabled,tool,onToolChange,kind="tool"}:Props){
 const [download,setDownload]=useState<{file_name:string}|null>(null),[error,setError]=useState<string|null>(null);
 useEffect(()=>{let cancelled=false;(async()=>{if(!productId)return;try{const session=await supabase.auth.getSession();if(!session.data.session)throw Error("Please log in again.");const r=await fetch("/api/admin/downloads?productId="+productId,{headers:{Authorization:"Bearer "+session.data.session.access_token},cache:"no-store"});const b=await r.json();if(!r.ok)throw Error(b.error??"Unable to read ZIP.");if(!cancelled){setDownload(b.download);setError(null);}}catch(e){if(!cancelled)setError(e instanceof Error?e.message:"Unable to read ZIP.");}})();return()=>{cancelled=true;};},[productId]);
 return <section className="admin-tool-package"><h2>Download ZIP</h2>{download?<strong>{download.file_name}</strong>:<p>{kind==="bundle"?"Generated from included tools when you update the product.":"No ZIP attached."}</p>}
 <label className="admin-zip-replace">{download?"Replace ZIP":"Choose ZIP"}<input type="file" accept=".zip" disabled={disabled} aria-label="Replace download ZIP" onChange={event=>{const file=event.target.files?.[0];event.target.value="";if(!file)return;if(download && file.name!==download.file_name){setError("Filename must be exactly "+download.file_name);return;}setError(null);onToolChange(file);}}/></label>
 {tool&&<p>{tool.name} <button type="button" onClick={()=>onToolChange(null)} disabled={disabled}>Remove selection</button></p>}{error&&<p role="alert" className="admin-product-error">{error}</p>}</section>;
}
