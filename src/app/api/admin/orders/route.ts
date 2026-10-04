import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const statuses = new Set(["pending", "paid", "refunded", "partially_refunded", "cancelled"]);
const sorts = new Set(["number", "email", "state", "price", "date"]);
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
    const sort = params.get("sort") ?? "date";
    const direction = params.get("direction") ?? "desc";
    if (!/^[1-9][0-9]{0,3}$/.test(rawPage) || (status !== "all" && !statuses.has(status)) || !sorts.has(sort) || !["asc", "desc"].includes(direction)) {
      return json({ error: "Invalid order filter or page." }, 400);
    }
    const { data, error } = await supabaseAdmin.rpc("read_admin_orders", {
      p_admin_id: authorization.user.id, p_page: Number(rawPage), p_status: status,
      p_sort: sort, p_direction: direction,
    });
    if (error || !data || !Array.isArray(data.orders)) return json({ error: "Unable to load orders. Please try again later." }, 503);
    return json(data);
  } catch {
    return json({ error: "Unable to load orders. Please try again later." }, 503);
  }
}
