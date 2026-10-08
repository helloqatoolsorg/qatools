import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  let target = new URL("/assets/qatools_logo.png", request.url).href;
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (url && key) {
      const client = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await client.from("site_branding").select("logo_path").eq("id", 1).single();
      if (!error && data?.logo_path && /^branding\/logos\/[a-f0-9-]{36}\.png$/.test(data.logo_path)) {
        target = client.storage.from("product-media").getPublicUrl(data.logo_path).data.publicUrl;
      }
    }
  } catch { /* The packaged logo remains available during a settings outage. */ }
  return new Response(null, { status: 302, headers: { Location: target, "Cache-Control": "no-store" } });
}
