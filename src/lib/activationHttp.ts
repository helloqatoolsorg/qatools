import "server-only";
import { NextResponse } from "next/server";

export function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", "Pragma": "no-cache" } });
}

// Bound streamed bodies too; Content-Length alone can be absent or inaccurate.
export async function readActivationBody(request: Request, maxBytes = 1024): Promise<Record<string, unknown> | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return data && typeof data === "object" && !Array.isArray(data) ? data : null;
  } catch { return null; }
  finally { reader.releaseLock(); }
}

export function activationFailure(code?: string) {
  switch (code) {
    case "credential_changed": return privateJson({ error: "Your activation key changed. Refresh before creating or replacing it." }, 409);
    case "account_unavailable": return privateJson({ error: "A confirmed, available account is required." }, 403);
    case "invalid_credential": return privateJson({ error: "Invalid activation key or unavailable account." }, 401);
    case "no_entitlements": return privateJson({ error: "Acquire a tool before activating this account." }, 403);
    case "machine_in_use": return privateJson({ error: "This account already has an active computer. Ask support to release it before activating another computer." }, 409);
    case "invalid_machine": return privateJson({ error: "A valid qatools machine ID is required." }, 400);
    default: return privateJson({ error: "Activation service unavailable. Please try again later." }, 503);
  }
}
