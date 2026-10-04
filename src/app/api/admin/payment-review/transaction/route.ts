import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { paymentReviewDatabase } from "@/lib/paymentReviewDatabase";
import { readSandboxTransaction } from "@/lib/paddleTransactionReview";
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
    const transactionId = new URL(request.url).searchParams.get("id") ?? "";
    if (!/^txn_[a-z0-9]{26}$/.test(transactionId)) return json({ error: "Invalid Paddle transaction reference." }, 400);
    const [order, checkout, event] = await Promise.all([
      paymentReviewDatabase.from("orders").select("order_number, status, currency, total")
        .eq("provider", "paddle_sandbox").eq("provider_transaction_id", transactionId).maybeSingle(),
      paymentReviewDatabase.from("sandbox_checkout_intents").select("id, status, currency, amount_cents")
        .eq("transaction_id", transactionId).maybeSingle(),
      paymentReviewDatabase.from("sandbox_payment_events").select("event_id")
        .eq("transaction_id", transactionId).limit(1).maybeSingle(),
    ]);
    if (order.error || checkout.error || event.error) return json({ error: "Unable to read saved payment records." }, 503);
    if (!order.data && !checkout.data && !event.data) return json({ error: "No saved sandbox record matches this transaction." }, 404);
    const transaction = await readSandboxTransaction(transactionId);
    return json({ transaction, order: order.data, checkout: checkout.data,
      comparison: comparePayment(transaction, order.data, checkout.data), checkedAt: new Date().toISOString() });
  } catch {
    return json({ error: "Unable to check Paddle. Please try again later or check the Paddle sandbox dashboard." }, 503);
  }
}
