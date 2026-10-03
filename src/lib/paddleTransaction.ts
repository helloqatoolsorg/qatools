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
