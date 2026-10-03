import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccount } from "@/lib/requireAccount";
import { decryptActivationKey } from "@/lib/activationKeyEncryption";
import { activationFailure, privateJson, readActivationBody } from "@/lib/activationHttp";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const authorization = await requireAccount(request);
    if (authorization.response) return authorization.response;
    const body = await readActivationBody(request);
    if (!body || typeof body.credentialId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.credentialId)) {
      return privateJson({ error: "Refresh the activation key panel and try again." }, 400);
    }
    const { data, error } = await supabaseAdmin.rpc("get_account_activation_secret", {
      p_user_id: authorization.user.id, p_expected_id: body.credentialId,
    });
    if (error || !data) return activationFailure();
    if (!data.ok) {
      if (data.code === "legacy_key") return privateJson({ error: "This older key cannot be revealed. Replace it once to enable Reveal for your account." }, 409);
      return activationFailure(data.code);
    }
    if (!data.encrypted_key || !data.secret_hash) return activationFailure();
    const key = decryptActivationKey(data.encrypted_key, authorization.user.id, data.secret_hash);
    return privateJson({ key, credentialId: body.credentialId });
  } catch { return activationFailure(); }
}
