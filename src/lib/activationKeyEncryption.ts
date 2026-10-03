import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { hashActivationKey, validActivationKey } from "@/lib/activationCredentials";

function encryptionKey() {
  const encoded = process.env.QATOOLS_ACTIVATION_ENCRYPTION_KEY;
  if (!encoded || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new Error("Activation encryption is not configured.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded) throw new Error("Invalid activation encryption configuration.");
  return key;
}

export function encryptActivationKey(secret: string, userId: string) {
  if (!validActivationKey(secret)) throw new Error("Invalid activation credential.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(`qatools:activation-key:v1:${userId}`, "utf8"));
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptActivationKey(envelope: string, userId: string, expectedHash: string) {
  if (!/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{62}$/.test(envelope)) throw new Error("Invalid encrypted credential.");
  const [, iv, tag, encrypted] = envelope.split(".");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"), { authTagLength: 16 });
  decipher.setAAD(Buffer.from(`qatools:activation-key:v1:${userId}`, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const secret = Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
  // Prevent revealing a stale encrypted value after credential replacement.
  if (!validActivationKey(secret) || !/^[0-9a-f]{64}$/.test(expectedHash) ||
    !timingSafeEqual(Buffer.from(hashActivationKey(secret), "hex"), Buffer.from(expectedHash, "hex"))) {
    throw new Error("Credential integrity check failed.");
  }
  return secret;
}
