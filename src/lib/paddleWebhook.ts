import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const MAX_PADDLE_WEBHOOK_BYTES = 1024 * 1024;
export class PaddleWebhookError extends Error {}

// A short timestamp window is a transport replay check; durable event-ID
// deduplication must also be implemented by the eventual fulfillment handler.
export function verifyPaddleSignature(rawBody: Buffer, header: string | null, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): void {
  if (!secret || secret.length > 512 || /\s/.test(secret)) throw new PaddleWebhookError("Webhook verification is not configured.");
  if (!header || header.length > 2048 || !rawBody.length || rawBody.length > MAX_PADDLE_WEBHOOK_BYTES || !Number.isSafeInteger(nowSeconds)) throw new PaddleWebhookError("Invalid webhook request.");
  let timestamp: string | undefined;
  const signatures: string[] = [];
  for (const part of header.split(";")) {
    const pair = part.trim().split("=");
    if (pair.length !== 2) throw new PaddleWebhookError("Invalid webhook signature.");
    const [name, value] = pair;
    if (name === "ts") {
      if (timestamp !== undefined || !/^[1-9][0-9]{0,11}$/.test(value)) throw new PaddleWebhookError("Invalid webhook timestamp.");
      timestamp = value;
    } else if (name === "h1" && /^[a-fA-F0-9]{64}$/.test(value)) signatures.push(value);
    else throw new PaddleWebhookError("Invalid webhook signature.");
  }
  if (!timestamp || signatures.length < 1 || signatures.length > 8 || Math.abs(nowSeconds - Number(timestamp)) > 5) throw new PaddleWebhookError("Invalid or expired webhook signature.");
  // Verify exact raw bytes. Parsing/reformatting JSON changes the signed payload.
  const expected = createHmac("sha256", secret).update(timestamp + ":").update(rawBody).digest();
  let matched = false;
  for (const signature of signatures) matched = timingSafeEqual(expected, Buffer.from(signature, "hex")) || matched;
  if (!matched) throw new PaddleWebhookError("Invalid webhook signature.");
}

export async function readPaddleBody(request: Request): Promise<Buffer> {
  const reader = request.body?.getReader();
  if (!reader) throw new PaddleWebhookError("Webhook body is required.");
  try {
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PADDLE_WEBHOOK_BYTES) { await reader.cancel(); throw new PaddleWebhookError("Webhook body is too large."); }
      chunks.push(value);
    }
    if (!size) throw new PaddleWebhookError("Webhook body is required.");
    return Buffer.concat(chunks);
  } finally { reader.releaseLock(); }
}

// Delivery IDs and JSON key order can change when Paddle replays the same event.
// Call only after signature verification; keep all event content in this digest.
export function paddleEventHash(payload: unknown): string {
  const source = payload as Record<string, unknown>;
  function canonical(value: unknown): string {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value !== null && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return '{' + Object.keys(record).sort().map(key => JSON.stringify(key) + ':' + canonical(record[key])).join(',') + '}';
    }
    return JSON.stringify(value);
  }
  const { notification_id: deliveryId, ...event } = source;
  void deliveryId;
  return createHash('sha256').update(canonical(event)).digest('hex');
}
