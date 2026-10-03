import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccount } from "@/lib/requireAccount";
import { encryptActivationKey } from "@/lib/activationKeyEncryption";
import { createActivationKey } from "@/lib/activationCredentials";
import { activationFailure, privateJson, readActivationBody } from "@/lib/activationHttp";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const authorization = await requireAccount(request);
    if (authorization.response) return authorization.response;
    const { data, error } = await supabaseAdmin.from("account_activation_credentials")
      .select("id, key_prefix, created_at, updated_at, reveal_available").eq("user_id", authorization.user.id).maybeSingle();
    if (error) return activationFailure();
    return privateJson({ credential: data });
  } catch { return activationFailure(); }
}

export async function POST(request: Request) {
  try {
    const authorization = await requireAccount(request);
    if (authorization.response) return authorization.response;
    const body = await readActivationBody(request);
    const expected = body?.expectedCredentialId;
    if (!body || !Object.hasOwn(body, "expectedCredentialId") || (expected !== null &&
      (typeof expected !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(expected)))) {
      return privateJson({ error: "Refresh the activation key panel and try again." }, 400);
    }
    const generated = createActivationKey();
    const encrypted = encryptActivationKey(generated.key, authorization.user.id);
    const { data, error } = await supabaseAdmin.rpc("set_account_activation_credential", {
      p_user_id: authorization.user.id, p_secret_hash: generated.hash,
      p_key_prefix: generated.prefix, p_expected_id: expected, p_encrypted_key: encrypted,
    });
    if (error || !data) return activationFailure();
    if (!data.ok) return activationFailure(data.code);
    return privateJson({ credential: data.credential }, expected === null ? 201 : 200);
  } catch { return activationFailure(); }
}
