import {licensingNetworkLimit,licensingRequestLimit} from "@/lib/licensingRequestLimit";
import {privateJson,readActivationBody,activationFailure} from "@/lib/activationHttp";
import {verifyToolTrialLicense} from "@/lib/signedToolTrialLicense";
import {signingConfiguration,issueDenial,type SignedEnvelope} from "@/lib/signedLicense";
import {trialDatabase} from "@/lib/trialDatabase";
import {trialRenewal} from "@/lib/trialActivation";
export const runtime="nodejs";
export async function POST(request:Request){
 try{
  const limited=await licensingNetworkLimit(request,"renew");if(limited)return limited;
  signingConfiguration();
  const b=await readActivationBody(request,131072);
  if(!b||typeof b.slug!=="string"||!/^[a-z0-9][a-z0-9_-]{0,127}$/.test(b.slug)||typeof b.nonce!=="string"||!/^[a-f0-9]{32}$/.test(b.nonce))return privateJson({error:"Invalid tool trial request."},400);
  let p;try{p=verifyToolTrialLicense(b.license as SignedEnvelope,Math.floor(Date.now()/1000),true);}catch{return privateJson({error:"Activate your QATools account first."},401);}
  if(p.machineId!==b.machineId)return privateJson({error:"License machine does not match."},401);
  const limit=await licensingRequestLimit("renew-assignment","tool-trial:"+p.activationId+":"+p.credentialId+":"+b.slug);if(limit)return limit;
  const r=await trialDatabase.rpc("start_tool_trial",{p_activation_id:Number(p.activationId),p_credential_id:p.credentialId,p_machine_id:p.machineId,p_slug:b.slug});
  if(r.error||!r.data)return activationFailure();
  if(!r.data.ok){
   if(["assignment_inactive","credential_changed","account_unavailable"].includes(r.data.code??""))return privateJson({error:"Activate your license again.",denial:issueDenial(b.license as SignedEnvelope,b.nonce,r.data.code!)},403);
   return privateJson({error:"This tool is not available for a trial."},409);
  }
  return await trialRenewal(Number(p.activationId),p.credentialId,p.machineId,undefined,undefined,true);
 }catch{return activationFailure();}
}
