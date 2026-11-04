import "server-only";
import { trialDatabase } from "./trialDatabase";
import { issueTrialLicense } from "./signedTrialLicense";
import {issueToolTrialLicense} from "./signedToolTrialLicense";
import { privateJson, activationFailure } from "./activationHttp";
import { licenseIdentity } from "./licenseIdentity";
import { issueDenial, type SignedEnvelope } from "./signedLicense";
export async function trialActivation(hash:string,machine:string,individual=false){
 const r=await trialDatabase.rpc("activate_trial_machine",{p_secret_hash:hash,p_machine_id:machine});
 if(r.error||!r.data)return activationFailure();
 if(!r.data.ok||!r.data.activation)return activationFailure(r.data.code);
 return trialRenewal(r.data.activation.id,r.data.activation.credential_id,machine,undefined,undefined,individual);
}
export async function trialRenewal(id:number,credential:string,machine:string, proof?:SignedEnvelope, nonce?:string,individual=false){
 const r=await trialDatabase.rpc(individual?"read_tool_trial_license":"read_trial_license",{p_activation_id:id,p_credential_id:credential,p_machine_id:machine});
 const d=r.data;
 if(r.error||!d)return activationFailure();
 if(!d.ok){
  if(proof && nonce && d.code && ["assignment_inactive","credential_changed","account_unavailable"].includes(d.code))
   return privateJson({error:"This license can no longer renew. Activate your account again.",denial:issueDenial(proof,nonce,d.code)},403);
  return activationFailure(d.code);
 }
 if(individual){
  if(!d.activation||!d.purchased||!d.free||!d.toolTrials)return activationFailure();
  return privateJson({license:issueToolTrialLicense({activationId:String(id),credentialId:credential,machineId:machine,purchased:d.purchased,free:d.free,toolTrials:d.toolTrials,issuedAt:Math.floor(Date.now()/1000),...await licenseIdentity(d.activation)})});
 }
 if(!d.activation||!d.purchased||!d.free||!d.trial||!d.trialStartedAt||!d.trialEndsAt)return activationFailure();
 return privateJson({license:issueTrialLicense({activationId:String(id),credentialId:credential,machineId:machine,purchased:d.purchased,free:d.free,trial:d.trial,trialStartedAt:d.trialStartedAt,trialEndsAt:d.trialEndsAt,issuedAt:Math.floor(Date.now()/1000),...await licenseIdentity(d.activation)})});
}
