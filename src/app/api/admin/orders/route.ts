import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const statuses = new Set(["pending", "paid", "refunded", "partially_refunded", "cancelled"]);
const pageSize = 50;
function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  try {
    const authorization = await requireAdmin(request);
    if (authorization.response) {
      authorization.response.headers.set("Cache-Control", "no-store");
      return authorization.response;
    }
    const params = new URL(request.url).searchParams;
    const rawPage = params.get("page") ?? "1";
    const status = params.get("status") ?? "all";
    if (!/^[1-9][0-9]{0,3}$/.test(rawPage) || (status !== "all" && !statuses.has(status))) {
      return json({ error: "Invalid order filter or page." }, 400);
    }
    const page = Number(rawPage);
    let query = supabaseAdmin.from("orders").select(`
      id, order_number, user_id, provider, provider_order_id, provider_transaction_id,
      status, currency, subtotal, total, created_at, provider_created_at,
      items:order_items(id, product_id, quantity, unit_price,
        product:products(id, name, slug))
    `).order("id", { ascending: false });
    if (status !== "all") query = query.eq("status", status);
    const { data, error } = await query.range((page - 1) * pageSize, page * pageSize);
    if (error) return json({ error: "Unable to load orders. Please try again later." }, 503);
    const rows = (data ?? []).slice(0, pageSize);
    const users = [...new Set(rows.map(order => order.user_id))];
    const names = new Map<string, string | null>();
    if (users.length) {
      const { data: profiles, error: profileError } = await supabaseAdmin.from("profiles")
        .select("user_id, name").in("user_id", users);
      if (profileError) return json({ error: "Unable to load order customers. Please try again later." }, 503);
      for (const profile of profiles ?? []) names.set(profile.user_id, profile.name);
    }
    return json({ orders: rows.map(order => ({ ...order, customerName: names.get(order.user_id) ?? null })),
      page, hasMore: (data?.length ?? 0) > pageSize });
  } catch {
    return json({ error: "Unable to load orders. Please try again later." }, 503);
  }
}
