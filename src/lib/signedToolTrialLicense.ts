import "server-only";
import {sign,verify} from "node:crypto";
import {OFFLINE_SECONDS,signingConfiguration,type SignedEnvelope} from "./signedLicense";
import {validate as validateAccountTrial,type TrialLicense} from "./signedTrialLicense";
export type ToolTrialLicense=Omit<TrialLicense,"version"|"trial"|"trialStartedAt"|"trialEndsAt"> & {version:4;toolTrials:Record<string,{startedAt:number;endsAt:number}>};
function validate(p:ToolTrialLicense,now:number,allowExpired:boolean){
 if(!p||p.version!==4||!p.toolTrials||typeof p.toolTrials!=="object"||Array.isArray(p.toolTrials)||Object.keys(p.toolTrials).length>1000)throw Error("Invalid tool trials.");
 validateAccountTrial({...p,version:3,trial:[],trialStartedAt:p.issuedAt,trialEndsAt:p.issuedAt+OFFLINE_SECONDS},now,allowExpired);
 for(const [slug,t] of Object.entries(p.toolTrials))if(!/^[a-z0-9][a-z0-9_-]{0,127}$/.test(slug)||!t||!Number.isSafeInteger(t.startedAt)||!Number.isSafeInteger(t.endsAt)||t.startedAt<=0||t.startedAt>p.issuedAt||t.endsAt-t.startedAt!==OFFLINE_SECONDS)throw Error("Invalid tool deadline.");
 return p;
}
export function issueToolTrialLicense(input:Omit<ToolTrialLicense,"vendor"|"version"|"kind"|"keyId"|"expiresAt">):SignedEnvelope{
 const c=signingConfiguration(),p:ToolTrialLicense={...input,vendor:"qatools",version:4,kind:"license",keyId:c.keyId,expiresAt:input.issuedAt+OFFLINE_SECONDS};validate(p,p.issuedAt,false);
 const raw=Buffer.from(JSON.stringify(p));if(raw.toString("base64url").length>100000)throw Error("License too large.");
 return {payload:raw.toString("base64url"),signature:sign(null,raw,c.privateKey).toString("base64url")};
}
export function verifyToolTrialLicense(envelope:SignedEnvelope,now=Math.floor(Date.now()/1000),allowExpired=false){
 if(!envelope||typeof envelope.payload!=="string"||typeof envelope.signature!=="string"||envelope.payload.length>100000||envelope.signature.length!==86||!/^[A-Za-z0-9_-]+$/.test(envelope.payload)||!/^[A-Za-z0-9_-]+$/.test(envelope.signature))throw Error("Invalid proof.");
 const raw=Buffer.from(envelope.payload,"base64url"),signature=Buffer.from(envelope.signature,"base64url"),c=signingConfiguration();
 if(raw.toString("base64url")!==envelope.payload||!verify(null,raw,c.publicKey,signature))throw Error("Invalid signature.");
 const p=validate(JSON.parse(raw.toString("utf8")),now,allowExpired);if(p.keyId!==c.keyId)throw Error("Wrong signing key.");return p;
}
