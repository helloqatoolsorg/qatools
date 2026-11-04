import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { privateJson } from "@/lib/activationHttp";

// Public readiness metadata only. Paths and signed URLs remain private.
export async function GET() {
  try {
    const {data,error} = await supabaseAdmin.from("products")
      .select("id,product_downloads(enabled)").eq("published",true).limit(1000);
    if (error || !data) return privateJson({error:"Download availability unavailable."},503);
    return privateJson({products:data.map(product => ({id:product.id,
      available:Array.isArray(product.product_downloads) ? product.product_downloads.some(file=>file.enabled) : !!product.product_downloads?.enabled}))});
  } catch { return privateJson({error:"Download availability unavailable."},503); }
}
