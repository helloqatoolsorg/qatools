import "server-only";
import { paddleSandboxApiConfig } from "./paddleSandbox";
import { paddleCartDatabase, type PriceMapping, type CartLine } from "./paddleCartDatabase";
export type CartProduct = { id: number; slug: string; price_eur: number | string; published: boolean };
export class CartPriceMismatchError extends Error {}
export function euroCents(value: number | string): number {
  const text = String(value);
  if (!/^(0|[1-9][0-9]{0,5})(\.[0-9]{1,2})?$/.test(text)) throw new Error("Invalid item price.");
  const [whole, fraction = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (cents <= 0 || cents > 99999999) throw new Error("Invalid paid item price.");
  return cents;
}
export async function validateCartPrice(product: CartProduct, mapping: PriceMapping): Promise<CartLine> {
  const amount = euroCents(product.price_eur);
  if (!product.published || product.id !== mapping.product_id || !mapping.enabled ||
      !/^pri_[a-z0-9]{26}$/.test(mapping.price_id) || !/^pro_[a-z0-9]{26}$/.test(mapping.paddle_product_id)) throw new Error("Item unavailable.");
  const config = paddleSandboxApiConfig();
  const response = await fetch(config.apiBase + "/prices/" + mapping.price_id + "?include=product", {
    headers: { Authorization: "Bearer " + config.apiKey }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Unable to verify price.");
  const p = (await response.json())?.data;
  if (!p || p.id !== mapping.price_id || p.product_id !== mapping.paddle_product_id || p.status !== "active" ||
      p.type !== "standard" || p.billing_cycle !== null || p.trial_period !== null || p.tax_mode !== "internal" ||
      p.unit_price?.amount !== String(amount) || p.unit_price?.currency_code !== "EUR" ||
      p.quantity?.minimum !== 1 || p.quantity?.maximum !== 1 || !Array.isArray(p.unit_price_overrides) || p.unit_price_overrides.length !== 0 ||
      p.product?.id !== mapping.paddle_product_id || p.product.name !== product.slug || p.product.status !== "active" || p.product.tax_category !== "standard") {
    throw new CartPriceMismatchError("Paddle price must match this tool's published EUR price, including tax, one-time, quantity one.");
  }
  return { productId: product.id, slug: product.slug, amount, priceId: mapping.price_id, paddleProductId: mapping.paddle_product_id };
}
export async function cartMappings() {
  const result = await paddleCartDatabase.from("sandbox_product_prices").select("product_id,price_id,paddle_product_id,enabled");
  if (result.error) throw new Error("Price mapping unavailable.");
  return result.data ?? [];
}
