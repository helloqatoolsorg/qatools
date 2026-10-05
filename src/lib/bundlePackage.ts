import "server-only";
import { inflateRawSync } from "node:zlib";
import { validToolZip } from "./adminDownloadUpload";
import { crc32, validHda, runtimeFiles } from "./houdiniPackage";
export type BundleTool = { id:number; slug:string };
// Only installer paths are accepted. Uploaded runtime/config copies are discarded;
// the release builder inserts the current centrally maintained versions once.
export function bundleTools(bytes:Buffer, tools:BundleTool[]):{name:string;bytes:Buffer}[] {
 if (!tools.length || tools.length>100 || new Set(tools.map(t=>t.id)).size!==tools.length || tools.some(t=>!Number.isSafeInteger(t.id)||t.id<1||!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(t.slug)) || !validToolZip(bytes)) throw new Error("Invalid bundle ZIP or included tools.");
 let end=bytes.length-22;while(end>=0 && (bytes.readUInt32LE(end)!==0x06054b50 || end+22+bytes.readUInt16LE(end+20)!==bytes.length))end--;
 if(end<0)throw new Error("Invalid bundle ZIP.");
 const count=bytes.readUInt16LE(end+10),offset=bytes.readUInt32LE(end+16),seen=new Set<string>(),found=new Map<number,{name:string;bytes:Buffer}>(),ranges:{start:number;end:number}[]=[];
 const shared=new Set(["qatools.json",...runtimeFiles.map(n=>"qatools/python3.13libs/qatools_licensing/"+n),"qatools/scripts/pythonrc.py"]);
 const directories=new Set(["qatools/","qatools/otls/","qatools/python3.13libs/","qatools/python3.13libs/qatools_licensing/","qatools/scripts/"]);
 let cursor=offset,total=0;
 for(let i=0;i<count;i++){
  const flags=bytes.readUInt16LE(cursor+8),method=bytes.readUInt16LE(cursor+10),compressed=bytes.readUInt32LE(cursor+20),length=bytes.readUInt32LE(cursor+24),nameLength=bytes.readUInt16LE(cursor+28),local=bytes.readUInt32LE(cursor+42);
  const name=bytes.subarray(cursor+46,cursor+46+nameLength).toString("utf8");
  if(seen.has(name.toLowerCase()) || (flags & ~0x808)!==0 || ![0,8].includes(method) || length>4*1024*1024 || (total+=length)>25*1024*1024)throw new Error("Duplicate, unsupported or oversized bundle entry.");seen.add(name.toLowerCase());
  const start=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28),finish=start+compressed;
  if(finish>offset || bytes.readUInt16LE(local+6)!==flags || bytes.readUInt16LE(local+8)!==method || ranges.some(r=>local<r.end && finish>r.start))throw new Error("Invalid bundle entry bounds.");ranges.push({start:local,end:finish});
  if(!(flags & 8) && (bytes.readUInt32LE(local+14)!==bytes.readUInt32LE(cursor+16) || bytes.readUInt32LE(local+18)!==compressed || bytes.readUInt32LE(local+22)!==length))throw new Error("Inconsistent bundle entry.");
  const payload=bytes.subarray(start,finish),data=method===0?payload:inflateRawSync(payload,{maxOutputLength:Math.max(1,length)});
  if(data.length!==length || crc32(data)!==bytes.readUInt32LE(cursor+16))throw new Error("Corrupt bundle entry.");
  if(directories.has(name)){if(length!==0)throw new Error("Invalid bundle directory.");}
  else if(shared.has(name)){/* Replaced by the trusted release builder. */}
  else {
   if(!name.startsWith("qatools/otls/") || !validHda(name.slice(13),data))throw new Error("Bundle ZIP must contain only selected HDAs under qatools/otls and standard installer files.");
   const file=name.slice(13),stem=file.replace(/\.hda(lc|nc)?$/i,"");
   const matches=tools.filter(t=>stem===t.slug || stem===t.slug+"_online");
   if(matches.length!==1 || found.has(matches[0].id))throw new Error("Use one HDA per selected tool, named tool-slug.hda (or tool-slug_online.hdalc).");
   found.set(matches[0].id,{name:file,bytes:data});
  }
  cursor+=46+nameLength+bytes.readUInt16LE(cursor+30)+bytes.readUInt16LE(cursor+32);
 }
 if(found.size!==tools.length)throw new Error("The ZIP is missing an included tool. Save the tool selection and upload its matching ZIP.");
 return [...tools].sort((a,b)=>a.id-b.id).map(t=>found.get(t.id)!);
}
