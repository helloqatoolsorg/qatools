import "server-only";
import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

export const OFFLINE_SECONDS = 30 * 24 * 60 * 60;
export type SignedEnvelope = { payload: string; signature: string };
export type LicensePayload = {
  vendor: "qatools"; version: 2; kind: "license"; keyId: string;
  activationId: string; credentialId: string; machineId: string;
  products: string[]; issuedAt: number; expiresAt: number;
  accountEmail?: string; activatedAt?: number;
};
type Assignment = { id: number; machine_id: string; credential_id: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function signingConfiguration() {
  const encoded = process.env.QATOOLS_LICENSE_SIGNING_KEY;
  const keyId = process.env.QATOOLS_LICENSE_SIGNING_KEY_ID;
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || !keyId || !/^[a-zA-Z0-9_-]{1,80}$/.test(keyId)) throw new Error("License signing unavailable.");
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.toString("base64") !== encoded) throw new Error("Invalid signing configuration.");
  const privateKey = createPrivateKey({ key: bytes, format: "der", type: "pkcs8" });
  if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("Invalid signing algorithm.");
  return { privateKey, publicKey: createPublicKey(privateKey), keyId };
}

function encode(value: object): SignedEnvelope {
  const configuration = signingConfiguration();
  const bytes = Buffer.from(JSON.stringify({ ...value, keyId: configuration.keyId }), "utf8");
  return { payload: bytes.toString("base64url"), signature: sign(null, bytes, configuration.privateKey).toString("base64url") };
}

function decodePart(value: unknown, maxLength: number) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value) || value.length > maxLength) throw new Error("Invalid signed proof.");
  const bytes = Buffer.from(value, "base64url");
  if (bytes.toString("base64url") !== value) throw new Error("Invalid signed encoding.");
  return bytes;
}

export function verifyLicense(envelope: unknown, allowExpired = false, now = Math.floor(Date.now() / 1000)): LicensePayload {
  if (!envelope || typeof envelope !== "object" || !("payload" in envelope) || !("signature" in envelope)) throw new Error("Signed license required.");
  const bytes = decodePart(envelope.payload, 100000);
  const signature = decodePart(envelope.signature, 86);
  const configuration = signingConfiguration();
  if (signature.length !== 64 || !verify(null, bytes, configuration.publicKey, signature)) throw new Error("Invalid license signature.");
  const value = JSON.parse(bytes.toString("utf8"));
  if (!value || value.vendor !== "qatools" || value.version !== 2 || value.kind !== "license" || value.keyId !== configuration.keyId ||
    typeof value.activationId !== "string" || !/^[1-9][0-9]*$/.test(value.activationId) || !Number.isSafeInteger(Number(value.activationId)) ||
    typeof value.credentialId !== "string" || !uuid.test(value.credentialId) ||
    typeof value.machineId !== "string" || !/^[A-F0-9]{16}$/.test(value.machineId) ||
    !Array.isArray(value.products) || value.products.length === 0 || value.products.length > 1000 ||
    value.products.some((p: unknown) => typeof p !== "string" || !/^[a-z0-9][a-z0-9_-]{0,127}$/.test(p)) ||
    new Set(value.products).size !== value.products.length ||
    !Number.isSafeInteger(value.issuedAt) || !Number.isSafeInteger(value.expiresAt) || value.issuedAt <= 0 ||
    value.expiresAt - value.issuedAt !== OFFLINE_SECONDS || value.issuedAt > now + 300 || (!allowExpired && now >= value.expiresAt)) {
    throw new Error("Invalid or expired license.");
  }
  if ((value.accountEmail !== undefined && (typeof value.accountEmail !== "string" || value.accountEmail.length > 320 || !/^[^\s@]+@[^\s@]+$/.test(value.accountEmail))) ||
      (value.activatedAt !== undefined && (!Number.isSafeInteger(value.activatedAt) || value.activatedAt <= 0 || value.activatedAt > value.issuedAt + 300))) throw new Error("Invalid license identity.");
  return value;
}

export function issueLicense(assignment: Assignment, products: { slug: string }[], now = Math.floor(Date.now() / 1000), identity: { accountEmail?: string; activatedAt?: number } = {}): SignedEnvelope {
  const envelope = encode({ vendor: "qatools", version: 2, kind: "license", activationId: String(assignment.id),
    credentialId: assignment.credential_id, machineId: assignment.machine_id,
    products: [...new Set(products.map(p => p.slug))].sort(), issuedAt: now, expiresAt: now + OFFLINE_SECONDS, ...identity });
  verifyLicense(envelope, false, now);
  return envelope;
}

export function licenseDigest(envelope: SignedEnvelope) {
  return createHash("sha256").update(`${envelope.payload}.${envelope.signature}`, "utf8").digest("hex");
}

export function issueDenial(proof: SignedEnvelope, nonce: string, reason: string) {
  return encode({ vendor: "qatools", version: 2, kind: "denial", licenseDigest: licenseDigest(proof),
    nonce, reason, issuedAt: Math.floor(Date.now() / 1000) });
}
