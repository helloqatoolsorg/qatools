import "server-only";
import {createHash} from "node:crypto";
import {inflateRawSync} from "node:zlib";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
import {validToolZip} from "./adminDownloadUpload";
import {crc32,validHda,validShelfTool,validProjectPath,sharedHoudiniRuntimeEntries,packageConfig,makePackageZip,type PackageEntry} from "./houdiniPackage";

// Read server-built immutable releases; replace only the shared runtime/config.
// No customer-selected path is accepted by this helper or the download endpoint.
export function releasePayload(bytes:Buffer):{entries:PackageEntry[];projectRoot?:string} {
  if(bytes.length>26*1024*1024||!validToolZip(bytes,1113))throw Error('Invalid release archive.');
  let end=bytes.length-22;
  while(end>=0&&(bytes.readUInt32LE(end)!==0x06054b50||end+22+bytes.readUInt16LE(end+20)!==bytes.length))end--;
  if(end<0)throw Error('Invalid release directory.');
  const count=bytes.readUInt16LE(end+10),offset=bytes.readUInt32LE(end+16),seen=new Set<string>(),ranges:{start:number;end:number}[]=[],entries:PackageEntry[]=[];
  let cursor=offset,total=0,tools=0,projectRoot:string|undefined;
  for(let i=0;i<count;i++) {
    const flags=bytes.readUInt16LE(cursor+8),method=bytes.readUInt16LE(cursor+10),compressed=bytes.readUInt32LE(cursor+20),length=bytes.readUInt32LE(cursor+24),nameLength=bytes.readUInt16LE(cursor+28),local=bytes.readUInt32LE(cursor+42);
    const name=bytes.subarray(cursor+46,cursor+46+nameLength).toString('utf8');
    if(seen.has(name.toLowerCase())||flags!==0x800||![0,8].includes(method)||(total+=length)>25*1024*1024||!validProjectPath(name.replace(/\/$/,'')))throw Error('Invalid release entry.');
    seen.add(name.toLowerCase());
    const start=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28),finish=start+compressed;
    if(finish>offset||ranges.some(r=>local<r.end&&finish>r.start)||bytes.readUInt16LE(local+6)!==flags||bytes.readUInt16LE(local+8)!==method||bytes.readUInt32LE(local+14)!==bytes.readUInt32LE(cursor+16)||bytes.readUInt32LE(local+18)!==compressed||bytes.readUInt32LE(local+22)!==length)throw Error('Invalid release bounds.');
    ranges.push({start:local,end:finish});
    const data=method===0?bytes.subarray(start,finish):inflateRawSync(bytes.subarray(start,finish),{maxOutputLength:Math.max(1,length)});
    if(data.length!==length||crc32(data)!==bytes.readUInt32LE(cursor+16))throw Error('Corrupt release entry.');
    const hda=/^QATools\/otls\/([^/]+)$/.exec(name),shelf=/^QATools\/toolbar\/([^/]+)$/.exec(name);
    if(hda||shelf) {
      if(hda?!validHda(hda[1],data):!validShelfTool(shelf![1],data))throw Error('Invalid released tool.');
      entries.push({name,bytes:data});tools++;
    }else if(name.startsWith('Project/')){
      const root=name.split('/').slice(0,2).join('/')+'/';
      if(name.split('/').length<3||(projectRoot&&root!==projectRoot))throw Error('Invalid Project directory.');
      projectRoot=root;entries.push({name,bytes:data});
    }else if(name==='PROJECT-README.txt')entries.push({name,bytes:data});
    else if(name!=='QATools.json'&&!/^QATools\/(?:python3\.13libs\/qatools_licensing\/(?:__init__|client|config|houdini_ui)\.py|scripts\/python\/qatools_licensing\/(?:__init__|client|config|houdini_ui)\.py|scripts\/pythonrc\.py)$/.test(name))throw Error('Unexpected release file.');
    cursor+=46+nameLength+bytes.readUInt16LE(cursor+30)+bytes.readUInt16LE(cursor+32);
  }
  if(!tools||tools>100)throw Error('Released tools are missing.');
  return {entries,projectRoot};
}

let runtimePromise:Promise<{entries:PackageEntry[];hash:string}>|undefined;
async function currentRuntime(){
  runtimePromise??=sharedHoudiniRuntimeEntries(Buffer.from(JSON.stringify(packageConfig))).then(entries=>{
    const hash=createHash('sha256');for(const entry of entries)hash.update(entry.name).update('\0').update(entry.bytes);
    return {entries,hash:hash.digest('hex')};
  }).catch(error=>{runtimePromise=undefined;throw error;});
  return runtimePromise;
}
export async function releaseDelivery(productId:number,release:{id:string;file_path:string;file_name:string;compatibility:string}):Promise<string>{
  // The current shared package supports Houdini 21+. Do not silently serve an
  // incompatible runtime if this support floor changes in a future release.
  const minimum=/^Houdini (\d+) and newer$/.exec(release.compatibility)?.[1];
  if(!minimum||Number(minimum)<21)throw Error('A compatible licensing package is required for this release.');
  const runtime=await currentRuntime();
  const path=productId+'/releases/'+release.id+'/'+runtime.hash+'/'+release.file_name;
  const store=supabaseAdmin.storage.from('qatools-downloads');
  const exists=await store.exists(path);
  // storage-js returns an error alongside data:false for missing HEAD objects.
  // Treat only its documented missing statuses as a cache miss; other failures
  // must not be mistaken for absent data.
  const headError=exists.error as {status?:number|string;originalError?:{status?:number}}|null;
  const status=Number(headError?.status ?? headError?.originalError?.status);
  if(exists.error && ![400,404].includes(status ?? 0))throw Error('Release storage unavailable.');
  if(!exists.data){
    const archived=await store.download(release.file_path);
    if(archived.error||!archived.data||archived.data.size>26*1024*1024)throw Error('Archived release unavailable.');
    const payload=releasePayload(Buffer.from(await archived.data.arrayBuffer()));
    const bytes=makePackageZip([...runtime.entries,...payload.entries],payload.projectRoot);
    const saved=await store.upload(path,bytes,{contentType:'application/zip',upsert:false});
    if(saved.error){const raced=await store.exists(path);if(raced.error||!raced.data)throw Error('Unable to prepare compatible release.');}
  }
  return path;
}
