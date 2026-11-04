import {randomBytes,randomUUID,randomInt,createHash} from "node:crypto";
import {connectionDatabase,validConnectionId} from "@/lib/houdiniConnection";
import {licensingNetworkLimit,licensingRequestLimit} from "@/lib/licensingRequestLimit";
import {activationFailure,privateJson,readActivationBody} from "@/lib/activationHttp";
import {signingConfiguration} from "@/lib/signedLicense";
import {trialRenewal} from "@/lib/trialActivation";
export const runtime="nodejs";
export async function POST(request:Request){
 try{
  const limited=await licensingNetworkLimit(request,"renew");if(limited)return limited;
  const b=await readActivationBody(request);if(!b||typeof b.machineId!=="string"||!/^[A-F0-9]{16}$/.test(b.machineId))return privateJson({error:"A valid machine ID is required."},400);
  if(b.action==="start"){
   const limit=await licensingRequestLimit("activate-key","browser-connect:"+b.machineId);if(limit)return limit;
   if(typeof b.machineName!=="string"||b.machineName.length<1||b.machineName.length>80||/[\x00-\x1f\x7f]/.test(b.machineName))return privateJson({error:"A valid computer name is required."},400);
   signingConfiguration();
   const id=randomUUID(),token=randomBytes(32).toString("hex"),code=String(randomInt(0,1000000)).padStart(6,"0");
   const r=await connectionDatabase.rpc("houdini_connection",{p_action:"start",p_id:id,p_secret_hash:createHash("sha256").update(token).digest("hex"),p_machine_id:b.machineId,p_machine_name:b.machineName,p_display_code:code});
   if(r.error||!r.data?.ok)return activationFailure();
   return privateJson({id,token,displayCode:code,expiresIn:300});
  }
  if(b.action!=="claim"||!validConnectionId(b.id)||typeof b.token!=="string"||!/^[a-f0-9]{64}$/.test(b.token))return privateJson({error:"Invalid account connection."},400);
  const limit=await licensingRequestLimit("renew-assignment","browser-connect:"+b.id);if(limit)return limit;
  signingConfiguration();
  const r=await connectionDatabase.rpc("houdini_connection",{p_action:"claim",p_id:b.id,p_secret_hash:createHash("sha256").update(b.token).digest("hex"),p_machine_id:b.machineId});
  if(r.error||!r.data)return activationFailure();
  if(!r.data.ok)return ["connection_expired","connection_unavailable"].includes(r.data.code??"")?privateJson({error:"Connection expired or unavailable. Start again in Houdini."},410):activationFailure(r.data.code);
  if(r.data.pending)return privateJson({pending:true},202);
  const a=r.data.activation;if(!a)return activationFailure();
  return await trialRenewal(a.id,a.credential_id,b.machineId,undefined,undefined,b.licenseVersion===4);
 }catch{return activationFailure();}
}
