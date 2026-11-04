import "server-only";
import { sign, verify } from "node:crypto";
import { OFFLINE_SECONDS, signingConfiguration, type SignedEnvelope } from "./signedLicense";
export type TrialLicense = {
 vendor: "qatools"; version: 3; kind: "license"; keyId: string;
 activationId: string; credentialId: string; machineId: string;
 purchased: string[]; free: string[]; trial: string[];
 accountEmail?: string; activatedAt?: number;
 trialStartedAt: number; trialEndsAt: number; issuedAt: number; expiresAt: number;
};
export function validate(p: TrialLicense, now: number, allowExpired: boolean) {
 if (!p || p.vendor !== "qatools" || p.version !== 3 || p.kind !== "license" ||
 typeof p.activationId !== "string" || !/^[1-9][0-9]*$/.test(p.activationId) || !Number.isSafeInteger(Number(p.activationId)) ||
 typeof p.credentialId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.credentialId) ||
 typeof p.machineId !== "string" || !/^[A-F0-9]{16}$/.test(p.machineId) ||
 [p.purchased,p.free,p.trial].some(a=>!Array.isArray(a)||a.length>1000||new Set(a).size!==a.length||a.some(s=>typeof s!=="string"||!/^[a-z0-9][a-z0-9_-]{0,127}$/.test(s))) ||
 [p.trialStartedAt,p.trialEndsAt,p.issuedAt,p.expiresAt].some(t=>!Number.isSafeInteger(t)||t<=0) ||
 p.trialEndsAt-p.trialStartedAt!==OFFLINE_SECONDS || p.expiresAt-p.issuedAt!==OFFLINE_SECONDS ||
 p.trialStartedAt>p.issuedAt || p.issuedAt>now+300 || (!allowExpired&&now>=p.expiresAt)) throw new Error("Invalid trial license.");
 if ((p.accountEmail !== undefined && (typeof p.accountEmail !== "string" || p.accountEmail.length > 320 || !/^[^\s@]+@[^\s@]+$/.test(p.accountEmail))) ||
 (p.activatedAt !== undefined && (!Number.isSafeInteger(p.activatedAt) || p.activatedAt <= 0 || p.activatedAt > p.issuedAt + 300))) throw new Error("Invalid license identity.");
 return p;
}
export function issueTrialLicense(input: Omit<TrialLicense,"vendor"|"version"|"kind"|"keyId"|"expiresAt">): SignedEnvelope {
 const c=signingConfiguration();
 const p:TrialLicense={...input,vendor:"qatools",version:3,kind:"license",keyId:c.keyId,expiresAt:input.issuedAt+OFFLINE_SECONDS};
 validate(p,input.issuedAt,false);
 const raw=Buffer.from(JSON.stringify(p));
 if(raw.toString("base64url").length>100000) throw new Error("License too large.");
 return {payload:raw.toString("base64url"),signature:sign(null,raw,c.privateKey).toString("base64url")};
}
export function verifyTrialLicense(envelope: SignedEnvelope, now=Math.floor(Date.now()/1000), allowExpired=false) {
 if(!envelope||typeof envelope.payload!=="string"||typeof envelope.signature!=="string"||envelope.payload.length>100000||envelope.signature.length!==86||
 !/^[A-Za-z0-9_-]+$/.test(envelope.payload)||!/^[A-Za-z0-9_-]+$/.test(envelope.signature)) throw new Error("Invalid proof.");
 const raw=Buffer.from(envelope.payload,"base64url"),signature=Buffer.from(envelope.signature,"base64url"),c=signingConfiguration();
 if(raw.toString("base64url")!==envelope.payload||signature.toString("base64url")!==envelope.signature||!verify(null,raw,c.publicKey,signature)) throw new Error("Invalid signature.");
 const p=validate(JSON.parse(raw.toString("utf8")),now,allowExpired);
 if(p.keyId!==c.keyId) throw new Error("Wrong key.");
 return p;
}
// Call only with a verified payload. Ownership takes precedence over trial membership.
export function trialAccess(p: TrialLicense, slug: string, now: number): "purchased"|"free"|"trial"|"inactive" {
 if(now>=p.expiresAt||now<p.issuedAt-300) return "inactive";
 if(p.purchased.includes(slug)) return "purchased";
 if(p.free.includes(slug)) return "free";
 return now<p.trialEndsAt&&p.trial.includes(slug)?"trial":"inactive";
}
