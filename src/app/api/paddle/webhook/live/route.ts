import { createHash } from "node:crypto";
import { privateJson } from "@/lib/activationHttp";
import { paddleWebhookSecret } from "@/lib/paddleEnvironment";
import { paddleEventHash, PaddleWebhookError, readPaddleBody, verifyPaddleSignature } from "@/lib/paddleWebhook";
import { normalizePaddleEvent } from "@/lib/paddleFulfillment";
import { paddleLiveWebhookDatabase } from "@/lib/paddleWebhookDatabase";

export async function POST(request: Request) {
  let secret: string;
  try { secret = paddleWebhookSecret("live"); }
  catch { return privateJson({ error: "Webhook unavailable." }, 503); }
  try {
    const raw = await readPaddleBody(request);
    verifyPaddleSignature(raw, request.headers.get("paddle-signature"), secret);
    let event;
    try {
      const payload = JSON.parse(raw.toString("utf8"));
      event = { ...normalizePaddleEvent(payload, "live"), eventHash: paddleEventHash(payload) };
    }
    catch { return privateJson({ error: "Invalid event." }, 400); }
    const { data, error } = await paddleLiveWebhookDatabase.rpc("process_live_payment_event", {
      p_event: event, p_body_hash: createHash("sha256").update(raw).digest("hex"),
    });
    if (error || !data?.ok) return privateJson({ error: "Event processing unavailable. Retry delivery." }, 503);
    return privateJson({ received: true });
  } catch (error) {
    if (error instanceof PaddleWebhookError) return privateJson({ error: "Invalid webhook request." }, 400);
    return privateJson({ error: "Event processing unavailable. Retry delivery." }, 503);
  }
}
