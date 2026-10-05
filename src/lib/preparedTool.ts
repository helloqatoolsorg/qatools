import "server-only";
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { validToolZip } from "./adminDownloadUpload";
import { crc32, validHda } from "./houdiniPackage";
export type ToolIdentity = { schema:1; label:string; internal_name:string; slug:string; file:string; sha256:string };
export function preparedTool(bytes:Buffer):{identity:ToolIdentity;tool:{name:string;bytes:Buffer}} {
 if(bytes.length>5*1024*1024 || !validToolZip(bytes))throw Error("Choose a valid prepared tool ZIP.");
 let end=bytes.length-22;while(end>=0 && (bytes.readUInt32LE(end)!==0x06054b50 || end+22+bytes.readUInt16LE(end+20)!==bytes.length))end--;
 if(end<0 || bytes.readUInt16LE(end+10)!==2)throw Error("Prepared ZIP must contain one HDA and qatools-tool.json.");
 const offset=bytes.readUInt32LE(end+16),entries=new Map<string,Buffer>(),ranges:{start:number;end:number}[]=[];
 let cursor=offset,total=0;
 for(let i=0;i<2;i++){
  const flags=bytes.readUInt16LE(cursor+8),method=bytes.readUInt16LE(cursor+10),compressed=bytes.readUInt32LE(cursor+20),length=bytes.readUInt32LE(cursor+24),n=bytes.readUInt16LE(cursor+28),local=bytes.readUInt32LE(cursor+42);
  const name=bytes.subarray(cursor+46,cursor+46+n).toString("utf8");
  if(!/^[a-z0-9][a-z0-9_.-]*$/.test(name) || entries.has(name) || (flags & ~0x808)!==0 || ![0,8].includes(method) || length>4*1024*1024 || (total+=length)>4*1024*1024+8192 || (name==="qatools-tool.json" && length>8192))throw Error("Unsupported prepared ZIP entry.");
  const start=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28),finish=start+compressed;
  if(finish>offset || bytes.readUInt16LE(local+6)!==flags || bytes.readUInt16LE(local+8)!==method || ranges.some(r=>local<r.end && finish>r.start))throw Error("Invalid prepared ZIP bounds.");
  ranges.push({start:local,end:finish});
  if(!(flags & 8) && (bytes.readUInt32LE(local+14)!==bytes.readUInt32LE(cursor+16) || bytes.readUInt32LE(local+18)!==compressed || bytes.readUInt32LE(local+22)!==length))throw Error("Inconsistent prepared ZIP entry.");
  const payload=bytes.subarray(start,finish),data=method===0?payload:inflateRawSync(payload,{maxOutputLength:Math.max(1,length)});
  if(data.length!==length || crc32(data)!==bytes.readUInt32LE(cursor+16))throw Error("Corrupt prepared ZIP entry.");
  entries.set(name,data);cursor+=46+n+bytes.readUInt16LE(cursor+30)+bytes.readUInt16LE(cursor+32);
 }
 let identity:ToolIdentity;
 try{identity=JSON.parse(entries.get("qatools-tool.json")!.toString("utf8"));}catch{throw Error("Prepared tool metadata is missing or invalid.");}
 if(!identity || Object.keys(identity).sort().join(",")!=="file,internal_name,label,schema,sha256,slug" || identity.schema!==1 || typeof identity.label!=="string" || !/^[A-Za-z][A-Za-z0-9]*(?: [A-Za-z0-9]+)*$/.test(identity.label) || identity.label.length>80 || identity.internal_name!==identity.label.replaceAll(" ","_") || identity.slug!==identity.internal_name.toLowerCase() || !/^[a-z0-9][a-z0-9_]{0,79}$/.test(identity.slug) || typeof identity.file!=="string" || !["hda","hdalc","hdanc"].some(ext=>identity.file===identity.slug+"."+ext) || typeof identity.sha256!=="string" || !/^[a-f0-9]{64}$/.test(identity.sha256))throw Error("Asset Label and Internal Name must match: Beautiful Noise → Beautiful_Noise → beautiful_noise.");
 const hda=entries.get(identity.file);
 if(!hda || !validHda(identity.file,hda) || createHash("sha256").update(hda).digest("hex")!==identity.sha256)throw Error("The HDA does not match its prepared metadata.");
 return {identity,tool:{name:identity.file,bytes:hda}};
}
