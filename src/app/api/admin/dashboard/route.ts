import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { privateJson } from "@/lib/activationHttp";

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.response) {
      auth.response.headers.set("Cache-Control", "no-store");
      return auth.response;
    }
    const { data, error } = await supabaseAdmin.rpc("read_admin_dashboard_counts", { p_admin_id: auth.user.id });
    if (!error && data) return privateJson(data);
    if (error?.code === "PGRST202") {
      return privateJson({ error: "Dashboard counts require the 20261110100000_admin_dashboard_counts Supabase migration." }, 503);
    }
  } catch {
    // Keep server and database details out of the response.
  }
  return privateJson({ error: "Unable to load dashboard counts." }, 503);
}
