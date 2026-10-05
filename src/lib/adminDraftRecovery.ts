import { validDraft, type DraftInput } from "./productDraft";
export type DraftRecovery = { version:1; requestId:string; id:number|null; updatedAt:string|null; draft:DraftInput; priceText:string; savedAt:string; fileRevision:string; mainFile:File|null; galleryFiles:File[]; toolFile:File|null; recoveryWarning?:string };
const prefix="qatools.admin-draft:";
let writes:Promise<unknown>=Promise.resolve();
const selectedFiles=new Map<string,{mainFile:File|null;galleryFiles:File[];toolFile:File|null;revision:string;promise:Promise<void>}>();
function fileStore<T>(mode:IDBTransactionMode,run:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  return new Promise((resolve,reject)=>{
    const open=indexedDB.open("qatools-admin-drafts",1);
    open.onupgradeneeded=()=>{open.result.createObjectStore("files");};
    open.onerror=()=>reject(open.error);
    open.onsuccess=()=>{const db=open.result;try{const transaction=db.transaction("files",mode);const request=run(transaction.objectStore("files"));
      transaction.oncomplete=()=>{db.close();resolve(request.result);};
      transaction.onerror=transaction.onabort=()=>{db.close();reject(transaction.error ?? new Error("Draft file storage failed."));};
      }catch(error){db.close();reject(error);}
    };
  });
}
export function recoveryMetadata(raw:string|null):DraftRecovery|null {
  try {const value=JSON.parse(raw ?? "null");
    if(!value || value.version!==1 || typeof value.requestId!=="string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.requestId) || typeof value.priceText!=="string" || typeof value.fileRevision!=="string" || !Number.isFinite(Date.parse(value.savedAt)) || (value.id!==null && (!Number.isSafeInteger(value.id)||value.id<1)) || (value.updatedAt!==null && !Number.isFinite(Date.parse(value.updatedAt)))) return null;
    // A work-in-progress title may be blank or incomplete; never send it to SQL until validated.
    if(!value.draft || typeof value.draft.name!=="string" || value.draft.name.length>80 || !validDraft({...value.draft,name:"recovery"})) return null;
    return {...value,mainFile:null,galleryFiles:[],toolFile:null};
  } catch{return null;}
}
export async function readDraftRecovery(userId:string):Promise<DraftRecovery|null>{
  const meta=recoveryMetadata(localStorage.getItem(prefix+userId));if(!meta)return null;
  let files; try {files=await fileStore<{revision:string;mainFile:File|null;galleryFiles:File[];toolFile:File|null}|undefined>("readonly",s=>s.get(userId));} catch {return {...meta,recoveryWarning:"Draft text recovered. Browser file storage is unavailable; reselect any pending files."};}
  if(files?.revision===meta.fileRevision)return {...meta,mainFile:files.mainFile,galleryFiles:files.galleryFiles,toolFile:files.toolFile};
  if(files || (meta as DraftRecovery & {hasFiles?:boolean}).hasFiles) return {...meta,recoveryWarning:"Draft text recovered, but the latest file selections were not saved. Reselect those files."};
  return meta;
}
export function writeDraftRecovery(userId:string,snapshot:DraftRecovery):Promise<void>{
  const {mainFile,galleryFiles,toolFile,...meta}=snapshot;
  const previous=selectedFiles.get(userId);
  const same=previous && previous.mainFile===mainFile && previous.toolFile===toolFile && previous.galleryFiles.length===galleryFiles.length && previous.galleryFiles.every((f,i)=>f===galleryFiles[i]);
  const revision=same?previous.revision:snapshot.fileRevision;
  // Only file changes rewrite blobs. Every keystroke still saves text synchronously.
  localStorage.setItem(prefix+userId,JSON.stringify({...meta,fileRevision:revision,hasFiles:!!mainFile || !!toolFile || !!galleryFiles.length}));
  if(same)return previous.promise;
  const job=writes.catch(()=>{}).then(()=>fileStore("readwrite",s=>s.put({revision,mainFile,galleryFiles,toolFile},userId)));
  const promise=job.then(()=>{},error=>{if(selectedFiles.get(userId)?.revision===revision)selectedFiles.delete(userId);throw error;});writes=promise;selectedFiles.set(userId,{mainFile,galleryFiles,toolFile,revision,promise});return promise;
}
export async function clearDraftRecovery(userId:string){
  localStorage.removeItem(prefix+userId);selectedFiles.delete(userId);
  const job=writes.catch(()=>{}).then(()=>fileStore("readwrite",s=>s.delete(userId)));writes=job;await job;
}
