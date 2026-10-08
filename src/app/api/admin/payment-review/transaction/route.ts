import { paddleEnvironment } from "@/lib/paddleEnvironment";
import { paddleScope } from "@/lib/paddleScope";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { paymentReviewDatabase } from "@/lib/paymentReviewDatabase";
import { readPaddleTransaction } from "@/lib/paddleTransactionReview";
import { comparePayment } from "@/lib/paymentComparison";

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
    const transactionId = params.get("id") ?? "";
    if (!/^txn_[a-z0-9]{26}$/.test(transactionId)) return json({ error: "Invalid Paddle transaction reference." }, 400);
    const [order, checkout, event] = await Promise.all([
      paymentReviewDatabase.from("orders").select("order_number, status, currency, total")
        .eq("provider", scope.provider).eq("provider_transaction_id", transactionId).maybeSingle(),
      paymentReviewDatabase.from(scope.intents).select("id, status, currency, amount_cents, charged_amount_cents")
        .eq("transaction_id", transactionId).maybeSingle(),
      paymentReviewDatabase.from(scope.events).select("event_id")
        .eq("transaction_id", transactionId).limit(1).maybeSingle(),
    ]);
    if (order.error || checkout.error || event.error) return json({ error: "Unable to read saved payment records." }, 503);
    if (!order.data && !checkout.data && !event.data) return json({ error: "No saved payment record matches this transaction." }, 404);
    const transaction = await readPaddleTransaction(transactionId, environment);
    return json({ environment, transaction, order: order.data, checkout: checkout.data,
      comparison: comparePayment(transaction, order.data, checkout.data), checkedAt: new Date().toISOString() });
  } catch {
    return json({ error: "Unable to check Paddle. Please try again later or check the matching Paddle dashboard." }, 503);
  }
}
