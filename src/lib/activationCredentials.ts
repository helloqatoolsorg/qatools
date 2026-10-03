import "server-only";
import { createHash, randomBytes } from "node:crypto";

export function hashActivationKey(key: string) {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export function createActivationKey() {
  const key = `QA_${randomBytes(32).toString("base64url")}`;
  return { key, hash: hashActivationKey(key), prefix: key.slice(0, 11) };
}

export function validActivationKey(key: string) {
  return /^QA_[A-Za-z0-9_-]{43}$/.test(key);
}
