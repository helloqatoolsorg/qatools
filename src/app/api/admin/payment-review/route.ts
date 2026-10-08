import { paddleEnvironment } from "@/lib/paddleEnvironment";
import { paddleScope } from "@/lib/paddleScope";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { paymentReviewDatabase } from "@/lib/paymentReviewDatabase";

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
    const environment = params.get("environment") ?? paddleEnvironment();
    if (environment !== "sandbox" && environment !== "live") return json({ error: "Choose a valid Paddle environment." },400);
    const scope = paddleScope(environment);
    const kind = params.get("kind") ?? "events";
    const rawPage = params.get("page") ?? "1";
    if (!/^[1-9][0-9]{0,3}$/.test(rawPage) || !["events", "checkouts", "refunds"].includes(kind)) {
      return json({ error: "Invalid payment review filter or page." }, 400);
    }
    const page = Number(rawPage), start = (page - 1) * pageSize, end = page * pageSize;
    // Older attempts need investigation; age is not proof that payment failed.
    const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const result = kind !== "checkouts"
      ? await paymentReviewDatabase.from(scope.events)
        .select("event_id, event_type, transaction_id, outcome, occurred_at, received_at")
        .eq("outcome", kind === "refunds" ? "refunded" : "review").order("received_at", { ascending: false })
        .order("event_id", { ascending: false }).range(start, end)
      : await paymentReviewDatabase.from(scope.intents)
        .select("id, user_id, product_id, status, transaction_id, created_at, updated_at")
        .in("status", ["creating", "unknown"]).lte("updated_at", cutoff)
        .order("updated_at", { ascending: false }).order("id", { ascending: false }).range(start, end);
    if (result.error) return json({ error: "Unable to load payment review. Please try again later." }, 503);
    return json({ environment, kind, records: (result.data ?? []).slice(0, pageSize), page,
      hasMore: (result.data?.length ?? 0) > pageSize });
  } catch {
    return json({ error: "Unable to load payment review. Please try again later." }, 503);
  }
}
