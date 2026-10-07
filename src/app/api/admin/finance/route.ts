import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: Request) {
  try {
    const authorization = await requireAdmin(request);
    if (authorization.response) {
      authorization.response.headers.set("Cache-Control", "private, no-store");
      return authorization.response;
    }
    const params = new URL(request.url).searchParams;
    const environment = params.get("environment") ?? "sandbox";
    const period = params.get("period") ?? "month";
    if (!["sandbox", "live"].includes(environment) || !["week", "month", "3months", "6months", "year"].includes(period)) {
      return json({ error: "Invalid finance filter." }, 400);
    }
    const { data, error } = await supabaseAdmin.rpc("read_admin_finance", {
      p_admin_id: authorization.user.id, p_environment: environment, p_period: period,
    });
    if (error || !data || !Array.isArray(data.currencies)) return json({ error: "Unable to load finance. Please try again later." }, 503);
    return json(data);
  } catch {
    return json({ error: "Unable to load finance. Please try again later." }, 503);
  }
}
