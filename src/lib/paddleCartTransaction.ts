import "server-only";
import { paddleApiConfig, paddleEnvironment, type PaddleEnvironment } from "./paddleEnvironment";
import { cartRecord, validateCartTransaction } from "./paddleCartValidation";
import type { PaddleCheckoutBilling } from "./paddleCheckoutBilling";
import type { CartLine } from "./paddleCartDatabase";
export async function fetchPayableCart(transactionId: string, intentId: string, items: CartLine[], environment: PaddleEnvironment = paddleEnvironment()) {
  if (!/^txn_[a-z0-9]{26}$/.test(transactionId)) throw new Error("Invalid transaction.");
  const config = paddleApiConfig(environment);
  const r = await fetch(config.apiBase + "/transactions/" + transactionId, {
    headers: { Authorization: "Bearer " + config.apiKey }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error("Unable to check checkout.");
  const verified = validateCartTransaction((await r.json()).data, intentId, items, false, environment);
  if (verified.id !== transactionId) throw new Error("Unexpected transaction.");
  return verified.id;
}
export async function createCartTransaction(intentId: string, items: CartLine[], environment: PaddleEnvironment, billing?: PaddleCheckoutBilling) {
  const config = paddleApiConfig(environment);
  // One POST only. An ambiguous response never permits automatic creation of a second transaction.
  const r = await fetch(config.apiBase + "/transactions", {
    method: "POST", headers: { Authorization: "Bearer " + config.apiKey, "Content-Type": "application/json" },
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
    body: JSON.stringify({ collection_mode: "automatic", currency_code: "EUR", items: items.map(i => ({ price_id: i.priceId, quantity: 1 })),
      ...billing,
      custom_data: { qatools_checkout_id: intentId, qatools_environment: environment, qatools_checkout_version: "cart-v1" } }),
  });
  if (!r.ok) throw new Error("Unable to prepare checkout.");
  const transaction = cartRecord((await r.json()).data);
  const verified = validateCartTransaction(transaction, intentId, items, false, environment);
  if (billing && Object.entries(billing).some(([field, id]) => transaction[field] !== id)) {
    throw new Error("Paddle did not apply the expected billing details.");
  }
  return verified.id;
}
