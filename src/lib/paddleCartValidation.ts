import type { CartLine } from "./paddleCartDatabase";
type Value = Record<string, unknown>;
export const cartRecord = (v: unknown): Value => v && typeof v === "object" && !Array.isArray(v) ? v as Value : {};
export const cartCents = (v: unknown): number | null => typeof v === "string" && /^(0|[1-9][0-9]{0,8})$/.test(v) ? Number(v) : null;
export function validateCartTransaction(value: unknown, intentId: string, expected?: CartLine[], paid = false) {
  const t = cartRecord(value), custom = cartRecord(t.custom_data), totals = cartRecord(cartRecord(t.details).totals);
  const items = Array.isArray(t.items) ? t.items : [], lines = cartRecord(t.details).line_items;
  if (typeof t.id !== "string" || !/^txn_[a-z0-9]{26}$/.test(t.id) ||
      !(paid ? ["completed"] : ["draft", "ready"]).includes(String(t.status)) || t.collection_mode !== "automatic" ||
      t.currency_code !== "EUR" || t.subscription_id !== null || t.discount_id !== null ||
      custom.qatools_environment !== "sandbox" || custom.qatools_checkout_version !== "cart-v1" || custom.qatools_checkout_id !== intentId ||
      items.length < 1 || items.length > 20 || !Array.isArray(lines) || lines.length !== items.length) throw new Error("Unexpected checkout.");
  const normalized: { priceId: string; paddleProductId: string; amount: number; chargedAmount: number; providerItemId: string }[] = [];
  const business = typeof t.business_id === "string" && /^biz_[a-z0-9]{26}$/.test(t.business_id);
  const ids = new Set<string>(), itemIds = new Set<string>();
  for (const value of items) {
    const i = cartRecord(value), p = cartRecord(i.price), unit = cartRecord(p.unit_price);
    const amount = cartCents(unit.amount), matches = lines.filter(v => cartRecord(v).price_id === p.id);
    const l = cartRecord(matches[0]), lt = cartRecord(l.totals), chargedAmount = cartCents(lt.total);
    if (i.quantity !== 1 || typeof p.id !== "string" || !/^pri_[a-z0-9]{26}$/.test(p.id) || ids.has(p.id) ||
        typeof p.product_id !== "string" || !/^pro_[a-z0-9]{26}$/.test(p.product_id) ||
        p.billing_cycle !== null || p.trial_period !== null || p.tax_mode !== "internal" || unit.currency_code !== "EUR" ||
        amount === null || amount <= 0 || matches.length !== 1 || l.quantity !== 1 || cartRecord(l.product).id !== p.product_id ||
        chargedAmount === null || chargedAmount <= 0 || chargedAmount > amount || lt.discount !== "0" || typeof l.id !== "string" || !/^txnitm_[a-z0-9]{26}$/.test(l.id) || itemIds.has(l.id)) throw new Error("Unexpected checkout item.");
    if (chargedAmount < amount) {
      const unitTotals = cartRecord(l.unit_totals);
      if (!business || typeof l.tax_rate !== "string" || !/^0(?:\.0{1,8})?$/.test(l.tax_rate) || lt.tax !== "0" || cartCents(lt.subtotal) !== chargedAmount ||
          unitTotals.discount !== "0" || unitTotals.tax !== "0" || cartCents(unitTotals.subtotal) !== chargedAmount || cartCents(unitTotals.total) !== chargedAmount) throw new Error("Unexpected tax adjustment.");
    }
    ids.add(p.id); itemIds.add(l.id);
    normalized.push({ priceId: p.id, paddleProductId: p.product_id, amount, chargedAmount, providerItemId: l.id });
  }
  normalized.sort((a,b) => a.priceId.localeCompare(b.priceId));
  const total = normalized.reduce((sum,line) => sum + line.chargedAmount, 0), catalogTotal = normalized.reduce((sum,line) => sum + line.amount, 0), subtotal = cartCents(totals.subtotal), tax = cartCents(totals.tax);
  if (total > 99999999 || totals.currency_code !== "EUR" || subtotal === null || tax === null || subtotal + tax !== total ||
      cartCents(totals.total) !== total || cartCents(totals.grand_total) !== total || cartCents(totals.balance) !== (paid ? 0 : total) ||
      totals.discount !== "0" || totals.credit !== "0" || totals.credit_to_balance !== "0") throw new Error("Unexpected checkout total.");
  const taxAdjusted = total < catalogTotal;
  if (taxAdjusted && (!business || tax !== 0 || subtotal !== total)) throw new Error("Unexpected business total.");
  if (expected && (expected.length !== normalized.length || expected.some(e => !normalized.some(n => n.priceId === e.priceId && n.paddleProductId === e.paddleProductId && n.amount === e.amount)))) throw new Error("Checkout no longer matches the saved cart.");
  return { id: t.id, items: normalized, total, subtotal, taxAdjusted };
}
