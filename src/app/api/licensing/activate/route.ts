import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hashActivationKey, validActivationKey } from "@/lib/activationCredentials";
import { activationFailure, privateJson, readActivationBody } from "@/lib/activationHttp";

import { issueLicense, signingConfiguration } from "@/lib/signedLicense";
import { licenseIdentity } from "@/lib/licenseIdentity";

export const runtime = "nodejs";

// Explicit activation only. A future renewal endpoint must never create an assignment.
export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization");
    const key = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!validActivationKey(key)) return activationFailure("invalid_credential");
    const body = await readActivationBody(request);
    if (!body || typeof body.machineId !== "string" || !/^[A-F0-9]{16}$/.test(body.machineId)) {
      return activationFailure("invalid_machine");
    }
    // Check signing configuration before any machine-assignment mutation.
    signingConfiguration();
    const { data, error } = await supabaseAdmin.rpc("activate_account_machine", {
      p_secret_hash: hashActivationKey(key), p_machine_id: body.machineId,
    });
    if (error || !data) return activationFailure();
    if (!data.ok) return activationFailure(data.code);
    if (!data.activation || !data.products) return activationFailure();
    // Recheck exact assignment/current credential before signing; never resurrect a released row.
    const renewed = await supabaseAdmin.rpc("renew_account_license", {
      p_activation_id: data.activation.id, p_credential_id: data.activation.credential_id, p_machine_id: data.activation.machine_id,
    });
    if (renewed.error || !renewed.data) return activationFailure();
    if (!renewed.data.ok) return activationFailure(renewed.data.code);
    if (!renewed.data.activation || !renewed.data.products) return activationFailure();
    return privateJson({ activation: renewed.data.activation, products: renewed.data.products,
      signedLicenseAvailable: true, license: issueLicense(renewed.data.activation, renewed.data.products, undefined, await licenseIdentity(renewed.data.activation)) });
  } catch { return activationFailure(); }
}
