import "server-only";
import { validToolZip } from "./adminDownloadUpload";
export function installerContents(bytes:Buffer):string[]{
 if(bytes.length>26*1024*1024 || !validToolZip(bytes))throw Error("Invalid installer ZIP.");
 let end=bytes.length-22;while(end>=0 && (bytes.readUInt32LE(end)!==0x06054b50 || end+22+bytes.readUInt16LE(end+20)!==bytes.length))end--;
 if(end<0)throw Error("Invalid ZIP directory.");
 const count=bytes.readUInt16LE(end+10);if(count>1000)throw Error("Too many ZIP entries.");
 let offset=bytes.readUInt32LE(end+16);const names:string[]=[];
 for(let i=0;i<count;i++){
  if(offset+46>end || bytes.readUInt32LE(offset)!==0x02014b50)throw Error("Invalid ZIP directory.");
  const length=bytes.readUInt16LE(offset+28),extra=bytes.readUInt16LE(offset+30),comment=bytes.readUInt16LE(offset+32);
  if(offset+46+length+extra+comment>end)throw Error("Invalid ZIP entry.");
  const name=bytes.subarray(offset+46,offset+46+length).toString("utf8");
  if(name.length>512 || name.startsWith("/") || name.split("/").some(part=>part===".."))throw Error("Invalid ZIP path.");
  if(!name.endsWith("/"))names.push(name);offset+=46+length+extra+comment;
 }
 return names.sort();
}
