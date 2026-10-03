import "server-only";
import { paddleSandboxApiConfig } from "./paddleSandbox";

// Verified sandbox catalog only. Live IDs and additional items require separate setup.
const qafit01 = Object.freeze({
  productId: 1, slug: "qafit01", amount: "500", currency: "EUR",
  paddleProductId: "pro_01m41bf7cprd18e5aebzyp1rzw",
  paddlePriceId: "pri_01m41bkp4f0fxgb9cfm37n5p4b",
});
type CatalogProduct = { id: number; slug: string; price_eur: number; published: boolean };
type PaddlePrice = {
  id?: string; product_id?: string; status?: string; type?: string;
  billing_cycle?: unknown; trial_period?: unknown; tax_mode?: string;
  unit_price?: { amount?: string; currency_code?: string };
  quantity?: { minimum?: number; maximum?: number }; unit_price_overrides?: unknown[];
  product?: { id?: string; name?: string; status?: string; tax_category?: string };
};

export function sandboxPriceForProduct(product: CatalogProduct) {
  if (product.id !== qafit01.productId || product.slug !== qafit01.slug ||
      !product.published || product.price_eur !== 5) {
    throw new Error("This item has no matching sandbox price.");
  }
  return qafit01;
}

export function validateSandboxPrice(product: CatalogProduct, price: PaddlePrice) {
  const mapping = sandboxPriceForProduct(product);
  if (!price || price.id !== mapping.paddlePriceId || price.product_id !== mapping.paddleProductId ||
      price.status !== "active" || price.type !== "standard" ||
      price.billing_cycle !== null || price.trial_period !== null || price.tax_mode !== "internal" ||
      price.unit_price?.amount !== mapping.amount || price.unit_price?.currency_code !== mapping.currency ||
      price.quantity?.minimum !== 1 || price.quantity?.maximum !== 1 ||
      !Array.isArray(price.unit_price_overrides) || price.unit_price_overrides.length !== 0 ||
      price.product?.id !== mapping.paddleProductId || price.product.name !== mapping.slug ||
      price.product.status !== "active" || price.product.tax_category !== "standard") {
    throw new Error("Paddle sandbox price does not match the item settings.");
  }
  return mapping;
}

// Call again before creating a transaction; a prior inspection is not permanent validation.
export async function fetchValidatedSandboxPrice(product: CatalogProduct) {
  const mapping = sandboxPriceForProduct(product);
  const config = paddleSandboxApiConfig();
  const response = await fetch(`${config.apiBase}/prices/${mapping.paddlePriceId}?include=product`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Unable to verify the Paddle sandbox price.");
  const result = await response.json();
  return validateSandboxPrice(product, result.data);
}
