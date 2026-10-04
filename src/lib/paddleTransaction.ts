import "server-only";
import { paddleSandboxApiConfig } from "./paddleSandbox";

export function validateSandboxTransaction(data: unknown, intentId: string, priceId: string): string {
  const txn = data as {
    id?: string; status?: string; collection_mode?: string; currency_code?: string;
    custom_data?: { qatools_checkout_id?: string; qatools_environment?: string };
    items?: { quantity?: number; price?: { id?: string } }[];
  } | null;
  if (!txn || !/^txn_[a-z0-9]{26}$/.test(txn.id ?? "") ||
    !["draft", "ready"].includes(txn.status ?? "") || txn.collection_mode !== "automatic" ||
    txn.currency_code !== "EUR" || txn.custom_data?.qatools_checkout_id !== intentId ||
    txn.custom_data.qatools_environment !== "sandbox" || !Array.isArray(txn.items) ||
    txn.items.length !== 1 || txn.items[0].quantity !== 1 || txn.items[0].price?.id !== priceId) {
    throw new Error("Paddle transaction could not be verified.");
  }
  return txn.id!;
}

export async function createSandboxTransaction(intentId: string, priceId: string) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(intentId) ||
    priceId !== "pri_01m41bkp4f0fxgb9cfm37n5p4b") throw new Error("Invalid sandbox checkout.");
  const config = paddleSandboxApiConfig();
  // No automatic POST retry: an ambiguous timeout may already have created a transaction.
  const response = await fetch(`${config.apiBase}/transactions`, {
    method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ collection_mode: "automatic", currency_code: "EUR",
      items: [{ price_id: priceId, quantity: 1 }],
      custom_data: { qatools_checkout_id: intentId, qatools_environment: "sandbox" } }),
  });
  if (!response.ok) throw new Error("Unable to prepare Paddle checkout.");
  return validateSandboxTransaction((await response.json()).data, intentId, priceId);
}

// Recheck saved transactions immediately before returning a checkout ID to the browser.
// This does not prove payment: only the verified webhook grants ownership.
export function validatePayableSandboxTransaction(data: unknown, transactionId: string, intentId: string, priceId: string) {
  const id = validateSandboxTransaction(data, intentId, priceId);
  const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  const txn = record(data), details = record(txn.details), totals = record(details.totals);
  const items = txn.items as { price: unknown }[];
  const price = record(items[0].price), unit = record(price.unit_price);
  const lines = Array.isArray(details.line_items) ? details.line_items : [];
  const line = record(lines[0]), lineTotals = record(line.totals);
  const cents = (value: unknown) => typeof value === "string" && /^(0|[1-9][0-9]{0,8})$/.test(value) ? Number(value) : null;
  const subtotal = cents(totals.subtotal), tax = cents(totals.tax);
  if (id !== transactionId || txn.subscription_id !== null || txn.discount_id !== null ||
      price.product_id !== "pro_01m41bf7cprd18e5aebzyp1rzw" || price.tax_mode !== "internal" ||
      price.billing_cycle !== null || price.trial_period !== null || unit.amount !== "500" || unit.currency_code !== "EUR" ||
      totals.currency_code !== "EUR" || subtotal === null || tax === null || subtotal + tax !== 500 ||
      totals.total !== "500" || totals.grand_total !== "500" || totals.balance !== "500" ||
      totals.discount !== "0" || totals.credit !== "0" || totals.credit_to_balance !== "0" ||
      lines.length !== 1 || line.price_id !== priceId || line.quantity !== 1 ||
      record(line.product).id !== price.product_id || lineTotals.total !== "500" || lineTotals.discount !== "0") {
    throw new Error("Paddle checkout is no longer payable at the expected price.");
  }
  return id;
}

export async function fetchPayableSandboxTransaction(transactionId: string, intentId: string, priceId: string) {
  if (!/^txn_[a-z0-9]{26}$/.test(transactionId)) throw new Error("Invalid sandbox transaction.");
  const config = paddleSandboxApiConfig();
  const response = await fetch(`${config.apiBase}/transactions/${transactionId}`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Unable to verify Paddle checkout.");
  return validatePayableSandboxTransaction((await response.json()).data, transactionId, intentId, priceId);
}
