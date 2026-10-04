import "server-only";
import { supabaseAdmin } from "./supabaseAdmin";

// Identity comes from the account owning the verified credential, never client input.
export async function licenseIdentity(assignment: { credential_id: string; activated_at: string }) {
  const { data, error } = await supabaseAdmin.from("account_activation_credentials")
    .select("user_id").eq("id", assignment.credential_id).maybeSingle();
  if (error || !data) throw new Error("License account unavailable.");
  const account = await supabaseAdmin.auth.admin.getUserById(data.user_id);
  const accountEmail = account.data.user?.email;
  const activatedAt = Math.floor(Date.parse(assignment.activated_at) / 1000);
  if (account.error || !accountEmail || !Number.isSafeInteger(activatedAt)) throw new Error("License identity unavailable.");
  return { accountEmail, activatedAt };
}
