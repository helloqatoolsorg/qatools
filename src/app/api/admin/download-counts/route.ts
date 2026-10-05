import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { privateJson } from "@/lib/activationHttp";
export async function GET(request: Request) {
  try {
    const auth = await requireAdmin(request); if (auth.response) { auth.response.headers.set("Cache-Control","no-store"); return auth.response; }
    const {data,error} = await supabaseAdmin.rpc("read_admin_download_counts",{p_admin_id:auth.user.id});
    if (error || !data) return privateJson({error:"Unable to load download counts."},503);
    return privateJson(data);
  } catch { return privateJson({error:"Unable to load download counts."},503); }
}
