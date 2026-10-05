"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
type Counts = { free:number;paid:number;admin:number;total:number };
export default function AdminDownloadCounts() {
  const [counts,setCounts]=useState<Counts|null>(null),[error,setError]=useState<string|null>(null),[revision,setRevision]=useState(0);
  useEffect(()=>{let cancelled=false; (async()=>{try {
    const session=await supabase.auth.getSession();if(session.error||!session.data.session)throw new Error("Please log in again.");
    const response=await fetch("/api/admin/download-counts",{cache:"no-store",headers:{Authorization:"Bearer "+session.data.session.access_token}});
    const body=await response.json();if(!response.ok)throw new Error(body.error??"Unable to load download counts.");
    if(!cancelled){setCounts(body);setError(null);}
  }catch(reason){if(!cancelled)setError(reason instanceof Error?reason.message:"Unable to load download counts.");}})();return()=>{cancelled=true;};},[revision]);
  return <section className="admin-download-counts"><div className="admin-count-heading"><h2>Downloads</h2><button type="button" onClick={()=>setRevision(v=>v+1)}>Refresh</button></div>
    {error?<p role="alert">{error}</p>:counts?<div className="admin-count-grid">{[["Free downloads",counts.free],["Paid downloads",counts.paid],["Admin-granted downloads",counts.admin],["Total",counts.total]].map(([label,value])=><div key={label}><span>{label}</span><strong>{Number(value).toLocaleString()}</strong></div>)}</div>:<p>Loading counts...</p>}
    <p className="user-muted">Successful download-link requests, including repeats. Counts start with this feature; they do not confirm completed file transfers.</p></section>;
}
