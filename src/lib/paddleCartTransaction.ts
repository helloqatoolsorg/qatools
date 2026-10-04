import "server-only";
import { paddleSandboxApiConfig } from "./paddleSandbox";
import { validateCartTransaction } from "./paddleCartValidation";
import type { CartLine } from "./paddleCartDatabase";
export async function fetchPayableCart(transactionId: string, intentId: string, items: CartLine[]) {
  if (!/^txn_[a-z0-9]{26}$/.test(transactionId)) throw new Error("Invalid transaction.");
  const config = paddleSandboxApiConfig();
  const r = await fetch(config.apiBase + "/transactions/" + transactionId, {
    headers: { Authorization: "Bearer " + config.apiKey }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error("Unable to check checkout.");
  const verified = validateCartTransaction((await r.json()).data, intentId, items);
  if (verified.id !== transactionId) throw new Error("Unexpected transaction.");
  return verified.id;
}
export async function createCartTransaction(intentId: string, items: CartLine[]) {
  const config = paddleSandboxApiConfig();
  // One POST only. An ambiguous response never permits automatic creation of a second transaction.
  const r = await fetch(config.apiBase + "/transactions", {
    method: "POST", headers: { Authorization: "Bearer " + config.apiKey, "Content-Type": "application/json" },
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
    body: JSON.stringify({ collection_mode: "automatic", currency_code: "EUR", items: items.map(i => ({ price_id: i.priceId, quantity: 1 })),
      custom_data: { qatools_checkout_id: intentId, qatools_environment: "sandbox", qatools_checkout_version: "cart-v1" } }),
  });
  if (!r.ok) throw new Error("Unable to prepare checkout.");
  return validateCartTransaction((await r.json()).data, intentId, items).id;
}
