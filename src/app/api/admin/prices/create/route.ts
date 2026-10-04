import { requireAdmin } from "@/lib/requireAdmin";
import { privateJson, readActivationBody } from "@/lib/activationHttp";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { paddleCartDatabase } from "@/lib/paddleCartDatabase";
import { euroCents, validateCartPrice, type CartProduct } from "@/lib/paddleCartCatalog";
import { catalogRequest, CatalogSetupError, findCatalogEntry } from "@/lib/paddleCatalogSetup";

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.response) { auth.response.headers.set("Cache-Control", "no-store"); return auth.response; }
    const raw = new URL(request.url).searchParams.get("productId");
    const productId = Number(raw);
    if (!raw || !/^[1-9][0-9]*$/.test(raw) || !Number.isSafeInteger(productId)) return privateJson({ error: "Choose an item." }, 400);
    const product = await supabaseAdmin.from("products").select("id,slug,price_eur,published").eq("id", productId).maybeSingle();
    const mapping = await paddleCartDatabase.from("sandbox_product_prices").select("product_id,price_id,paddle_product_id,enabled").eq("product_id", productId).maybeSingle();
    const job = await paddleCartDatabase.from("sandbox_catalog_setups").select("status,paddle_product_id,price_id").eq("product_id", productId).maybeSingle();
    if (product.error || mapping.error || job.error) throw new Error("Lookup failed.");
    if (!product.data) return privateJson({ error: "Item not found." }, 404);
    return privateJson({ product: product.data, mapping: mapping.data, setup: job.data });
  } catch { return privateJson({ error: "Unable to load this tool's Paddle setup." }, 503); }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.response) { auth.response.headers.set("Cache-Control", "no-store"); return auth.response; }
    const adminId = auth.user.id;
    const body = await readActivationBody(request, 1024);
    if (!body || Object.keys(body).some(k => !["productId", "expectedSlug", "expectedAmount"].includes(k)) ||
      typeof body.productId !== "number" || !Number.isSafeInteger(body.productId) || body.productId <= 0 ||
      typeof body.expectedSlug !== "string" || typeof body.expectedAmount !== "number" || !Number.isSafeInteger(body.expectedAmount) || body.expectedAmount <= 0) {
      return privateJson({ error: "Load a published paid tool before setting up Paddle." }, 400);
    }
    const found = await supabaseAdmin.from("products").select("id,slug,price_eur,published").eq("id", body.productId).maybeSingle();
    if (found.error) throw new Error("Lookup failed.");
    if (!found.data) return privateJson({ error: "Item not found." }, 404);
    const tool: CartProduct = found.data;
    if (!tool.published || !tool.slug || tool.slug.length > 150 || tool.slug !== body.expectedSlug || euroCents(tool.price_eur) !== body.expectedAmount) {
      return privateJson({ error: "The website tool or price changed. Reload the price panel." }, 409);
    }
    const mapped = await paddleCartDatabase.from("sandbox_product_prices").select("product_id,price_id,paddle_product_id,enabled").eq("product_id", tool.id).maybeSingle();
    const prior = await paddleCartDatabase.from("sandbox_catalog_setups").select("status,paddle_product_id,price_id").eq("product_id", tool.id).maybeSingle();
    if (mapped.error || prior.error) throw new Error("Lookup failed.");
    if (mapped.data) return privateJson({ error: "This tool already has a Paddle price. Use its existing mapping." }, 409);
    if (prior.data) return privateJson({ error: "A setup attempt already exists. Reload and connect its existing IDs; check Paddle if an ID is missing." }, 409);

    // Reads before reservation can be retried safely; no remote writes have occurred yet.
    const existing = await findCatalogEntry(tool);
    const reserved = await paddleCartDatabase.rpc("reserve_sandbox_catalog_setup", {
      p_admin_id: adminId, p_product_id: tool.id, p_slug: tool.slug, p_amount: body.expectedAmount,
    });
    if (reserved.error) throw new Error("Reservation failed.");
    if (!reserved.data?.ok || !reserved.data.created || !reserved.data.job) return privateJson({ error: "This tool changed or another setup is in progress. Reload before continuing." }, 409);
    const attemptId = reserved.data.job.attempt_id;
    async function advance(from: string, to: string, productId: string | null, priceId: string | null = null) {
      const result = await paddleCartDatabase.rpc("advance_sandbox_catalog_setup", {
        p_admin_id: adminId, p_attempt_id: attemptId, p_from: from, p_to: to, p_paddle_product_id: productId, p_price_id: priceId,
      });
      if (result.error || result.data !== true) throw new CatalogSetupError("Setup could not be recorded. Reload and check Paddle before continuing.");
    }
    let productId = existing.productId;
    if (!productId) {
      await advance("reserved", "product_creating", null);
      const result = await catalogRequest("/products", { name: tool.slug, type: "standard", tax_category: "standard", custom_data: { qatools_product_id: String(tool.id), qatools_setup_id: attemptId } });
      productId = result.data?.id;
      if (!productId || !/^pro_[a-z0-9]{26}$/.test(productId) || result.data.name !== tool.slug || result.data.status !== "active" || result.data.tax_category !== "standard") throw new CatalogSetupError("Check the created product in Paddle before continuing.");
      await advance("product_creating", "product_ready", productId);
    } else await advance("reserved", "product_ready", productId);
    let priceId = existing.priceId;
    if (!priceId) {
      await advance("product_ready", "price_creating", productId);
      const result = await catalogRequest("/prices", { product_id: productId, description: tool.slug + " one-time EUR purchase", name: tool.slug,
        type: "standard", unit_price: { amount: String(body.expectedAmount), currency_code: "EUR" }, tax_mode: "internal",
        billing_cycle: null, trial_period: null, quantity: { minimum: 1, maximum: 1 }, unit_price_overrides: [],
        custom_data: { qatools_product_id: String(tool.id), qatools_setup_id: attemptId } });
      priceId = result.data?.id;
      if (!priceId || !/^pri_[a-z0-9]{26}$/.test(priceId) || result.data.product_id !== productId) throw new CatalogSetupError("Check the created price in Paddle before continuing.");
      await advance("price_creating", "price_ready", productId, priceId);
    } else await advance("product_ready", "price_ready", productId, priceId);
    // Verify the actual stored provider price, then atomically map only the unchanged website snapshot.
    await validateCartPrice(tool, { product_id: tool.id, price_id: priceId, paddle_product_id: productId, enabled: true });
    const completed = await paddleCartDatabase.rpc("complete_sandbox_catalog_setup", { p_admin_id: adminId, p_attempt_id: attemptId });
    if (completed.error || completed.data !== true) throw new CatalogSetupError("Paddle entries are saved, but the website price changed or could not be linked. Reload and connect the existing IDs.");
    return privateJson({ message: "Paddle sandbox price is ready. The website price was verified and checkout is enabled." });
  } catch (error) {
    return privateJson({ error: error instanceof CatalogSetupError ? error.message : "Paddle setup could not finish. Reload and check Paddle before continuing; do not create duplicate entries." }, 503);
  }
}
