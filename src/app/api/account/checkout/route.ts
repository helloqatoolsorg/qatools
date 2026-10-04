import { requireAccount } from "@/lib/requireAccount";
import { privateJson, readActivationBody } from "@/lib/activationHttp";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { paddleCheckoutDatabase } from "@/lib/paddleCheckoutDatabase";
import { fetchValidatedSandboxPrice } from "@/lib/paddleCatalog";
import { paddleSandboxConfig } from "@/lib/paddleSandbox";
import { createSandboxTransaction, fetchPayableSandboxTransaction } from "@/lib/paddleTransaction";

export async function GET(request: Request) {
  try {
    const auth = await requireAccount(request, "checkout");
    if (auth.response) return auth.response;
    if (process.env.PADDLE_SANDBOX_CHECKOUT_ENABLED !== "true") return privateJson({ enabled: false });
    const config = paddleSandboxConfig();
    return privateJson({ enabled: true, environment: "sandbox", clientToken: config.clientToken });
  } catch { return privateJson({ enabled: false }); }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAccount(request, "checkout");
    if (auth.response) return auth.response;
    // Keep closed until verified webhook fulfillment and hosted delivery are ready.
    if (process.env.PADDLE_SANDBOX_CHECKOUT_ENABLED !== "true")
      return privateJson({ error: "Paid checkout is not available yet." }, 503);
    paddleSandboxConfig();
    const body = await readActivationBody(request, 2048);
    if (!body || Object.keys(body).length !== 1 || !Number.isSafeInteger(body.productId) || Number(body.productId) <= 0)
      return privateJson({ error: "Choose one valid item." }, 400);
    const { data: product, error: productError } = await supabaseAdmin.from("products")
      .select("id,slug,price_eur,published").eq("id", Number(body.productId)).single();
    if (productError || !product) return privateJson({ error: "Item unavailable." }, 400);
    const mapping = await fetchValidatedSandboxPrice(product);
    const { data: reservation, error } = await paddleCheckoutDatabase.rpc("reserve_sandbox_checkout", {
      p_user_id: auth.user.id, p_product_id: product.id,
    });
    if (error || !reservation?.ok || !reservation.intent)
      return privateJson({ error: "This item cannot be purchased by this account." }, error ? 503 : 409);
    const intent = reservation.intent;
    if (!reservation.created) {
      if (intent.status === "ready" && intent.transaction_id) {
        const transactionId = await fetchPayableSandboxTransaction(intent.transaction_id, intent.id, mapping.paddlePriceId);
        return privateJson({ transactionId });
      }
      return privateJson({ error: "Checkout is being prepared or needs review. Please do not retry payment." }, 409);
    }
    try {
      const transactionId = await createSandboxTransaction(intent.id, mapping.paddlePriceId);
      const saved = await paddleCheckoutDatabase.rpc("finish_sandbox_checkout", {
        p_user_id: auth.user.id, p_intent_id: intent.id, p_transaction_id: transactionId,
      });
      if (saved.error || !saved.data) throw new Error("Checkout save failed.");
      await fetchPayableSandboxTransaction(transactionId, intent.id, mapping.paddlePriceId);
      return privateJson({ transactionId });
    } catch {
      // Retain ambiguous attempts. Never create a second transaction by retrying POST.
      await paddleCheckoutDatabase.rpc("finish_sandbox_checkout", {
        p_user_id: auth.user.id, p_intent_id: intent.id, p_transaction_id: null,
      });
      return privateJson({ error: "Checkout could not be prepared. Contact support before trying again." }, 503);
    }
  } catch { return privateJson({ error: "Checkout unavailable. Please try again later." }, 503); }
}
