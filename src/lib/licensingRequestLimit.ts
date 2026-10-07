import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { privateJson } from "@/lib/activationHttp";

type Scope = "activate-ip" | "activate-key" | "renew-ip" | "renew-assignment";
export async function licensingRequestLimit(scope: Scope, subject: string): Promise<Response | null> {
  try {
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) throw new Error("Limiter configuration unavailable");
    const subjectHash = createHmac("sha256", secret).update(`${scope}:${subject}`).digest("hex");
    const { data, error } = await supabaseAdmin.rpc("consume_licensing_request", {
      p_scope: scope, p_subject_hash: subjectHash,
    });
    if (error || !data || typeof data.allowed !== "boolean" ||
        !Number.isInteger(data.retryAfter) || data.retryAfter < 1 || data.retryAfter > 60) throw new Error("Limiter unavailable");
    if (data.allowed) return null;
    const response = privateJson({ error: "Too many license requests. Please try again shortly." }, 429);
    response.headers.set("Retry-After", String(data.retryAfter));
    return response;
  } catch {
    return privateJson({ error: "License service temporarily unavailable. Please try again later." }, 503);
  }
}

export async function licensingNetworkLimit(request: Request, endpoint: "activate" | "renew") {
  // Trust platform-sanitized forwarding only on Vercel. Local headers are caller-controlled.
  let subject = "local-development";
  if (process.env.VERCEL === "1") {
    const ip = request.headers.get("x-forwarded-for")?.trim();
    if (!ip || !isIP(ip)) return privateJson({ error: "License service temporarily unavailable." }, 503);
    subject = isIP(ip) === 6 ? new URL(`http://[${ip}]/`).hostname : ip;
  } else if (process.env.NODE_ENV === "production") {
    return privateJson({ error: "License request limiting requires the configured hosting platform." }, 503);
  }
  return licensingRequestLimit(`${endpoint}-ip`, subject);
}
