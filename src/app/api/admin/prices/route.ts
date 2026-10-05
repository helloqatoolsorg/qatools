import { requireAdmin } from "@/lib/requireAdmin";
import { privateJson, readActivationBody } from "@/lib/activationHttp";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { paddleCartDatabase } from "@/lib/paddleCartDatabase";
import { cartMappings, verifyCatalogPrice } from "@/lib/paddleCartCatalog";
export async function GET(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.response) { auth.response.headers.set("Cache-Control", "no-store"); return auth.response; }
    return privateJson({ mappings: await cartMappings() });
  } catch { return privateJson({ error: "Unable to load sandbox prices." }, 503); }
}
export async function POST(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.response) { auth.response.headers.set("Cache-Control", "no-store"); return auth.response; }
    const body = await readActivationBody(request, 2048);
    if (!body || typeof body.productId !== "number" || !Number.isSafeInteger(body.productId) || body.productId <= 0 ||
        typeof body.priceId !== "string" || !/^pri_[a-z0-9]{26}$/.test(body.priceId) ||
        typeof body.paddleProductId !== "string" || !/^pro_[a-z0-9]{26}$/.test(body.paddleProductId) ||
        typeof body.enabled !== "boolean" || typeof body.expectedEnabled !== "boolean" ||
        typeof body.expectedPrice !== "string" || (body.expectedPrice !== "" && !/^pri_[a-z0-9]{26}$/.test(body.expectedPrice))) return privateJson({ error: "Choose valid sandbox product and price IDs." }, 400);
    const product = await supabaseAdmin.from("products").select("id,slug,price_eur,published").eq("id", body.productId).maybeSingle();
    if (product.error) throw new Error("Product lookup failed.");
    if (!product.data) return privateJson({ error: "Item not found." }, 404);
    if (body.enabled) {
      try { await verifyCatalogPrice(product.data, { product_id: body.productId, price_id: body.priceId, paddle_product_id: body.paddleProductId, enabled: true }); }
      catch { return privateJson({ error: "The Paddle price must match the saved tool: EUR including tax, one-time, quantity one, with the tool slug as its Paddle product name." }, 409); }
    }
    const saved = await paddleCartDatabase.rpc("set_sandbox_product_price", { p_admin_id: auth.user.id, p_product_id: body.productId,
      p_price_id: body.priceId, p_paddle_product_id: body.paddleProductId, p_enabled: body.enabled,
      p_expected_price: body.expectedPrice, p_expected_enabled: body.expectedEnabled });
    if (saved.error) throw new Error("Mapping save failed.");
    if (!saved.data?.ok) return privateJson({ error: "This price changed or could not be saved. Refresh before trying again." }, 409);
    return privateJson({ message: body.enabled ? "Sandbox price verified and enabled." : "Sandbox price disabled." });
  } catch { return privateJson({ error: "Sandbox price management unavailable." }, 503); }
}
