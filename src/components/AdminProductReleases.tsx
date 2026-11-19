"use client";
import {useEffect,useRef,useState} from "react";
import {supabase} from "@/lib/supabase";
import {houdiniCompatibilityOptions} from "@/lib/productDraft";
import type {ProductRelease,ReleaseRequest} from "@/lib/productRelease";
import "./AdminProductReleases.css";

type History=ProductRelease & {file_name:string};
async function token(){const session=await supabase.auth.getSession();if(session.error||!session.data.session)throw Error('Please log in again.');return session.data.session.access_token;}
export default function AdminProductReleases({productId,kind,compatibility,disabled,onBusyChange,onPublished}:{
  productId:number;kind:'tool'|'bundle'|'project';compatibility:string;disabled:boolean;
  onBusyChange:(busy:boolean)=>void;onPublished:()=>void;
}) {
  const [history,setHistory]=useState<History[]>([]),[download,setDownload]=useState<{file_path:string;file_name:string}|null>(null);
  const [file,setFile]=useState<File|null>(null),[notes,setNotes]=useState(''),[versionCompatibility,setVersionCompatibility]=useState(compatibility);
  const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[message,setMessage]=useState<string|null>(null),[revision,setRevision]=useState(0);
  const requestId=useRef<string|null>(null),inFlight=useRef(false);
  useEffect(()=>{
    const controller=new AbortController();
    void (async()=>{try{
      const r=await fetch('/api/admin/products/releases?productId='+productId,{headers:{Authorization:'Bearer '+await token()},cache:'no-store',signal:controller.signal});
      const b=await r.json();if(!r.ok)throw Error(b.error??'Unable to read releases.');
      if(!controller.signal.aborted){setHistory(b.releases);setDownload(b.download);setError(null);}
    }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Unable to read releases.');}})();
    return()=>controller.abort();
  },[productId,revision]);
  const latest=history.find(r=>r.latest);
  function changed(){requestId.current=null;setMessage(null);}
  async function publish(){
    if(inFlight.current||disabled||!latest||!download||(!file&&kind!=='bundle'))return;
    inFlight.current=true;setBusy(true);onBusyChange(true);setError(null);setMessage(null);
    try {
      requestId.current??=crypto.randomUUID();
      const release:ReleaseRequest={requestId:requestId.current,expectedReleaseId:latest.id,compatibility:versionCompatibility,notes};
      const params=new URLSearchParams({productId:String(productId),expectedPath:download.file_path,publication:'1'});
      const headers:Record<string,string>={Authorization:'Bearer '+await token()};
      let body:FormData|string;
      if(kind==='bundle'){headers['Content-Type']='application/json';body=JSON.stringify(release);}
      else {const form=new FormData();form.set('tool',file!);form.set('release',JSON.stringify(release));body=form;}
      const response=await fetch('/api/admin/products/'+(kind==='tool'?'package':'assemble')+'?'+params,{method:'POST',headers,body});
      const result=await response.json();if(!response.ok)throw Error(result.error??'Unable to publish this update.');
      setFile(null);setNotes('');requestId.current=null;setMessage(result.message);setRevision(value=>value+1);onPublished();
    }catch(e){setError(e instanceof Error?e.message:'Unable to publish this update.');}
    finally{inFlight.current=false;setBusy(false);onBusyChange(false);}
  }
  async function availability(release:History){
    if(inFlight.current||disabled)return;inFlight.current=true;setBusy(true);onBusyChange(true);setError(null);
    try{
      const r=await fetch('/api/admin/products/releases',{method:'PATCH',headers:{Authorization:'Bearer '+await token(),'Content-Type':'application/json'},body:JSON.stringify({releaseId:release.id,available:!release.available})});
      const b=await r.json();if(!r.ok)throw Error(b.error??'Unable to update release.');setRevision(value=>value+1);
    }catch(e){setError(e instanceof Error?e.message:'Unable to update release.');}
    finally{inFlight.current=false;setBusy(false);onBusyChange(false);}
  }
  return <section className="admin-product-releases">
    <h2>Publish update</h2>
    {download&&<p><strong>{download.file_name}</strong>{latest&&<> · v{latest.version}</>}</p>}
    <fieldset disabled={disabled||busy}>
      {kind==='bundle'?<p>Build a new release from the currently published included tools. Existing Bundle downloads stay unchanged until you publish.</p>:<label>{kind==='project'?'Choose Project source ZIP':'Choose replacement prepared ZIP'}<input type="file" accept=".zip" onChange={e=>{
        const selected=e.target.files?.[0];e.target.value='';if(!selected)return;
        if(download&&selected.name!==download.file_name){setError('Filename must be exactly '+download.file_name);return;}
        setFile(selected);setError(null);changed();
      }}/></label>}
      {file&&<p>{file.name} <button type="button" onClick={()=>{setFile(null);changed();}}>Remove selection</button></p>}
      <label>Compatibility for this release<select value={versionCompatibility} onChange={e=>{setVersionCompatibility(e.target.value);changed();}}>
        <option value="">Choose compatibility</option>{houdiniCompatibilityOptions.map(option=><option key={option}>{option}</option>)}
      </select></label>
      <label>Release notes<textarea rows={3} maxLength={2000} value={notes} onChange={e=>{setNotes(e.target.value);changed();}}/></label>
      <button className="admin-release-publish" type="button" disabled={!latest||!versionCompatibility||(!file&&kind!=='bundle')} onClick={()=>void publish()}>{busy?'Publishing…':'Publish update'}</button>
    </fieldset>
    {error&&<p role="alert" className="admin-product-error">{error}</p>}{message&&<p role="status">{message}</p>}
    {history.length>0&&<details><summary>Release history</summary><ul>{history.map(release=><li key={release.id}>
      <span>v{release.version}{release.latest?' · Latest':''} · {release.published_at.slice(0,10)} · {release.compatibility}{!release.available?' · Withdrawn':''}</span>
      {!release.latest&&<button type="button" disabled={disabled||busy} onClick={()=>void availability(release)}>{release.available?'Withdraw':'Restore'}</button>}
    </li>)}</ul></details>}
  </section>;
}
