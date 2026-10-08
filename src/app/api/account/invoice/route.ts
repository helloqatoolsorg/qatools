import { requireAccount } from "@/lib/requireAccount";
import { privateJson } from "@/lib/activationHttp";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { readPaddleInvoice } from "@/lib/paddleInvoice";
import { paddleEnvironmentForProvider } from "@/lib/paddleEnvironment";

export async function GET(request: Request) {
  try {
    const authorization = await requireAccount(request, "download invoices");
    if (authorization.response) return authorization.response;
    const id = new URL(request.url).searchParams.get("orderId") ?? "";
    if (!/^[1-9][0-9]{0,15}$/.test(id) || !Number.isSafeInteger(Number(id))) {
      return privateJson({ error: "Choose a valid order." }, 400);
    }
    // Bind the stored order to the verified customer; refunds retain invoice access.
    const order = await supabaseAdmin.from("orders")
      .select("provider,provider_transaction_id,status,total")
      .eq("id", Number(id)).eq("user_id", authorization.user.id).maybeSingle();
    if (order.error) throw new Error("Order lookup failed.");
    if (!order.data) return privateJson({ error: "Order not found." }, 404);
    const environment = paddleEnvironmentForProvider(order.data.provider);
    if (!environment ||
        !["paid", "refunded", "partially_refunded"].includes(order.data.status) ||
        !Number.isFinite(Number(order.data.total)) || Number(order.data.total) <= 0 ||
        typeof order.data.provider_transaction_id !== "string" ||
        !/^txn_[a-z0-9]{26}$/.test(order.data.provider_transaction_id ?? "")) {
      return privateJson({ error: "An invoice is not available for this order." }, 409);
    }
    return privateJson({ url: await readPaddleInvoice(order.data.provider_transaction_id, environment) });
  } catch {
    return privateJson({ error: "Unable to prepare your invoice. Please try again later." }, 503);
  }
}
