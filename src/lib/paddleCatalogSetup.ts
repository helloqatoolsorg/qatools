import "server-only";
import { paddleSandboxApiConfig } from "./paddleSandbox";
import { CartPriceMismatchError, euroCents, validateCartPrice, type CartProduct } from "./paddleCartCatalog";

export class CatalogSetupError extends Error {}
type ProviderProduct = { id: string; name: string; status: string; type: string; tax_category: string; prices?: { id: string }[] };

// Fixed sandbox origin only. Mutating calls are never automatically retried.
export async function catalogRequest(path: string, body?: object) {
  const config = paddleSandboxApiConfig();
  const response = await fetch(config.apiBase + path, {
    method: body ? "POST" : "GET", redirect: "error", cache: "no-store",
    headers: { Authorization: "Bearer " + config.apiKey, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10000), ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status === 401 || response.status === 403) {
    throw new CatalogSetupError("Check the Paddle sandbox API key permissions: Products Read and Write, and Prices Read and Write.");
  }
  if (!response.ok) throw new CatalogSetupError("Unable to complete Paddle setup. Reload the price panel and check Paddle before trying again.");
  return response.json();
}

export async function findCatalogEntry(product: CartProduct) {
  euroCents(product.price_eur);
  const matches: ProviderProduct[] = [];
  let cursor = "";
  // Bound the scan and fail closed if it cannot finish. Never follow provider-supplied URLs.
  for (let page = 0; page < 10; page++) {
    const result = await catalogRequest("/products?status=active,archived&include=prices&per_page=200&order_by=id[ASC]" + (cursor ? "&after=" + cursor : ""));
    if (!Array.isArray(result.data) || typeof result.meta?.pagination?.has_more !== "boolean") throw new CatalogSetupError("Unable to check the existing Paddle catalog.");
    matches.push(...result.data.filter((p: ProviderProduct) => p.name === product.slug));
    if (!result.meta.pagination.has_more) break;
    const next = result.data.at(-1)?.id;
    if (page === 9 || typeof next !== "string" || !/^pro_[a-z0-9]{26}$/.test(next) || next === cursor) throw new CatalogSetupError("Use the existing product and price IDs to connect this tool manually.");
    cursor = next;
  }
  if (matches.length > 1) throw new CatalogSetupError("More than one Paddle product has this name. Connect the correct IDs manually.");
  const existing = matches[0];
  if (!existing) return { productId: null, priceId: null };
  if (!/^pro_[a-z0-9]{26}$/.test(existing.id) || existing.status !== "active" || existing.type !== "standard" || existing.tax_category !== "standard" || !Array.isArray(existing.prices)) {
    throw new CatalogSetupError("The existing Paddle product is unavailable or has a different tax category. Check it in Paddle.");
  }
  const valid: string[] = [];
  if (existing.prices.length > 100) throw new CatalogSetupError("Connect this tool's price IDs manually.");
  for (const price of existing.prices) {
    try {
      await validateCartPrice(product, { product_id: product.id, paddle_product_id: existing.id, price_id: price.id, enabled: true });
      valid.push(price.id);
    } catch (error) {
      // Only a verified mismatch permits another price. Transport/permission failures stop setup.
      if (!(error instanceof CartPriceMismatchError)) throw error;
    }
  }
  if (valid.length > 1) throw new CatalogSetupError("More than one Paddle price matches. Connect the correct price ID manually.");
  return { productId: existing.id, priceId: valid[0] ?? null };
}
