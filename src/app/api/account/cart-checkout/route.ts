import { requireAccount } from "@/lib/requireAccount";
import { privateJson, readActivationBody } from "@/lib/activationHttp";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { paddleCartDatabase } from "@/lib/paddleCartDatabase";
import { paddleCheckoutDatabase } from "@/lib/paddleCheckoutDatabase";
import { cartMappings, validateCartPrice } from "@/lib/paddleCartCatalog";
import { paddleSandboxConfig } from "@/lib/paddleSandbox";
import { createCartTransaction, fetchPayableCart } from "@/lib/paddleCartTransaction";
export async function GET(request: Request) {
  try {
    const auth = await requireAccount(request, "checkout"); if (auth.response) return auth.response;
    if (process.env.PADDLE_SANDBOX_CHECKOUT_ENABLED !== "true") return privateJson({ enabled: false });
    const config = paddleSandboxConfig(), mappings = await cartMappings();
    return privateJson({ enabled: true, environment: "sandbox", clientToken: config.clientToken, productIds: mappings.filter(m => m.enabled).map(m => m.product_id) });
  } catch { return privateJson({ enabled: false }); }
}
export async function POST(request: Request) {
  try {
    const auth = await requireAccount(request, "checkout"); if (auth.response) return auth.response;
    if (process.env.PADDLE_SANDBOX_CHECKOUT_ENABLED !== "true") return privateJson({ error: "Paid checkout is not available yet." }, 503);
    paddleSandboxConfig();
    const body = await readActivationBody(request, 2048), ids = body?.productIds;
    if (!body || Object.keys(body).length !== 1 || !Array.isArray(ids) || ids.length < 1 || ids.length > 20 ||
        ids.some(i => typeof i !== "number" || !Number.isSafeInteger(i) || i <= 0) || new Set(ids).size !== ids.length) return privateJson({ error: "Choose up to 20 different paid items." }, 400);
    const products = await supabaseAdmin.from("products").select("id,slug,price_eur,published").in("id", ids);
    if (products.error || products.data?.length !== ids.length) return privateJson({ error: "An item is unavailable." }, 400);
    const mappings = await cartMappings();
    const items = await Promise.all(products.data.map(product => {
      const mapping = mappings.find(m => m.product_id === product.id);
      if (!mapping) throw new Error("Missing mapping.");
      return validateCartPrice(product, mapping);
    }));
    items.sort((a,b) => a.productId - b.productId);
    const reserved = await paddleCartDatabase.rpc("reserve_sandbox_cart", { p_user_id: auth.user.id, p_items: items });
    const reservation = reserved.data;
    if (reserved.error || !reservation?.ok || !reservation.intent) return privateJson({ error: "These items cannot be purchased. Check ownership or ask support about an earlier checkout." }, reserved.error ? 503 : 409);
    const intent = reservation.intent;
    let transactionId: string;
    if (!reservation.created) {
      if (intent.status !== "ready" || !intent.transaction_id || intent.version !== "cart-v1") return privateJson({ error: "An earlier checkout needs review. Please do not retry payment." }, 409);
      transactionId = await fetchPayableCart(intent.transaction_id, intent.id, intent.snapshot);
    } else {
      try {
        transactionId = await createCartTransaction(intent.id, intent.snapshot);
        const saved = await paddleCheckoutDatabase.rpc("finish_sandbox_checkout", { p_user_id: auth.user.id, p_intent_id: intent.id, p_transaction_id: transactionId });
        if (saved.error || !saved.data) throw new Error("Checkout binding failed.");
        await fetchPayableCart(transactionId, intent.id, intent.snapshot);
      } catch {
        await paddleCheckoutDatabase.rpc("finish_sandbox_checkout", { p_user_id: auth.user.id, p_intent_id: intent.id, p_transaction_id: null });
        return privateJson({ error: "Checkout could not be prepared. Contact support before trying again." }, 503);
      }
    }
    return privateJson({ transactionId, expected: { total: items.reduce((sum,i) => sum + i.amount,0) / 100, items: items.map(i => ({ priceId: i.priceId, slug: i.slug })) } });
  } catch { return privateJson({ error: "Checkout unavailable. Check that every paid item has a matching enabled sandbox price." }, 503); }
}
