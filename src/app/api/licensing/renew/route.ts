import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { privateJson, readActivationBody } from "@/lib/activationHttp";
import { issueDenial, issueLicense, signingConfiguration, verifyLicense, type SignedEnvelope } from "@/lib/signedLicense";
import { licenseIdentity } from "@/lib/licenseIdentity";

export const runtime = "nodejs";
const terminalReasons = new Set(["assignment_inactive", "credential_changed", "account_unavailable", "no_entitlements"]);

export async function POST(request: Request) {
  try {
    signingConfiguration();
    const body = await readActivationBody(request, 131072);
    if (!body || typeof body.machineId !== "string" || !/^[A-F0-9]{16}$/.test(body.machineId) ||
      typeof body.nonce !== "string" || !/^[a-f0-9]{32}$/.test(body.nonce)) {
      return privateJson({ error: "Invalid renewal request." }, 400);
    }
    let payload;
    try { payload = verifyLicense(body.license, true); }
    catch { return privateJson({ error: "A valid signed license is required." }, 401); }
    if (payload.machineId !== body.machineId) return privateJson({ error: "License machine does not match." }, 401);
    const { data, error } = await supabaseAdmin.rpc("renew_account_license", {
      p_activation_id: Number(payload.activationId), p_credential_id: payload.credentialId, p_machine_id: payload.machineId,
    });
    if (error || !data) return privateJson({ error: "Renewal temporarily unavailable." }, 503);
    if (!data.ok) {
      if (data.code && terminalReasons.has(data.code)) {
        return privateJson({ error: "This license can no longer renew. Check your qatools account or contact support.",
          denial: issueDenial(body.license as SignedEnvelope, body.nonce, data.code) }, 403);
      }
      return privateJson({ error: "Renewal temporarily unavailable." }, 503);
    }
    if (!data.activation || !data.products) return privateJson({ error: "Renewal temporarily unavailable." }, 503);
    return privateJson({ license: issueLicense(data.activation, data.products, undefined, await licenseIdentity(data.activation)) });
  } catch { return privateJson({ error: "Renewal temporarily unavailable." }, 503); }
}
