import "server-only";
import { paddleSandboxApiConfig } from "./paddleSandbox";

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : {};

export async function readSandboxTransaction(transactionId: string) {
  if (!/^txn_[a-z0-9]{26}$/.test(transactionId)) throw new Error("Invalid transaction.");
  const config = paddleSandboxApiConfig();
  const response = await fetch(`${config.apiBase}/transactions/${transactionId}`, {
    method: "GET", headers: { Authorization: `Bearer ${config.apiKey}` },
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Unable to read transaction.");
  const txn = record(record(await response.json()).data);
  const totals = record(record(txn.details).totals);
  if (txn.id !== transactionId || typeof txn.status !== "string" ||
      !["draft", "ready", "billed", "paid", "completed", "canceled", "past_due"].includes(txn.status) ||
      typeof txn.currency_code !== "string" || !/^[A-Z]{3}$/.test(txn.currency_code)) {
    throw new Error("Unexpected transaction response.");
  }
  const cents = (value: unknown) => typeof value === "string" && /^(0|[1-9][0-9]{0,14})$/.test(value) ? value : null;
  const custom = record(txn.custom_data);
  const checkoutId = typeof custom.qatools_checkout_id === "string" &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(custom.qatools_checkout_id)
    ? custom.qatools_checkout_id : null;
  return { id: transactionId, status: txn.status, currency: txn.currency_code,
    totalCents: totals.currency_code === txn.currency_code ? cents(totals.grand_total) : null,
    balanceCents: totals.currency_code === txn.currency_code ? cents(totals.balance) : null,
    checkoutId, sandboxAttribution: custom.qatools_environment === "sandbox" };
}
