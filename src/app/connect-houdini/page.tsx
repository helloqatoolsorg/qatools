"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {useAuth} from "@/context/AuthContext";
import {supabase} from "@/lib/supabase";
type Connection={machineName:string;machineId:string;displayCode:string};
export default function ConnectHoudini(){
 const {user,loading}=useAuth(),[connection,setConnection]=useState<Connection|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[done,setDone]=useState(false);
 async function call(approve=false){
  const session=await supabase.auth.getSession();if(!session.data.session)throw Error("Please log in.");
  const id=new URLSearchParams(window.location.search).get("id")??"";
  const r=await fetch("/api/account/houdini-connect"+(approve?"":"?id="+encodeURIComponent(id)),{method:approve?"POST":"GET",cache:"no-store",headers:{Authorization:"Bearer "+session.data.session.access_token,"Content-Type":"application/json"},...(approve?{body:JSON.stringify({id})}:{})});
  const b=await r.json();if(!r.ok)throw Error(b.error??"Unable to connect Houdini.");return b;
 }
 useEffect(()=>{let cancelled=false;if(user){void call().then(b=>{if(!cancelled)setConnection(b.connection);}).catch(e=>{if(!cancelled)setError(e.message);});}return()=>{cancelled=true;};},[user]);
 async function approve(){if(busy||!connection)return;setBusy(true);setError("");try{await call(true);setDone(true);}catch(e){setError(e instanceof Error?e.message:"Unable to connect Houdini.");}finally{setBusy(false);}}
 return <main className="houdini-connect-page"><Link href="/">qatools</Link><h1>Connect Houdini</h1>{loading?<p>Loading…</p>:!user?<><p>Log in to connect this computer to your qatools account.</p><button onClick={()=>window.dispatchEvent(new CustomEvent("qatools:login"))}>Log in</button></>:done?<p role="status">Approved. Return to Houdini to finish connecting.</p>:connection?<><p>Account: {user.email}</p><p>Computer: <strong>{connection.machineName}</strong></p><p>Machine ID: {connection.machineId}</p><p>Confirmation code: <strong>{connection.displayCode}</strong></p><p>Confirm only if this code matches the window you opened in Houdini.</p><p>With the latest installers, each unpurchased paid tool starts its own seven-day trial on first use in Houdini. Reconnecting does not restart existing trials. Projects are excluded.</p><button disabled={busy} onClick={()=>void approve()}>{busy?"Connecting…":"Connect this computer"}</button></>:!error?<p>Checking connection…</p>:null}{error&&<p role="alert">{error}</p>}</main>;
}
