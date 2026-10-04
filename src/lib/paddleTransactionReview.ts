import "server-only";
import { paddleSandboxApiConfig } from "./paddleSandbox";

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : {};
const cents = (value: unknown) => typeof value === "string" && /^(0|[1-9][0-9]{0,14})$/.test(value) ? value : null;
type Adjustment = { id: string; action: string; type: string; status: string; currency: string;
  totalCents: string | null; createdAt: string | null };

function adjustmentHistory(value: unknown, transactionId: string) {
  const unavailable = { available: false, truncated: false, records: [] as Adjustment[] };
  // Paddle omits included adjustments when the transaction has none.
  if (value === undefined) return { available: true, truncated: false, records: [] as Adjustment[] };
  if (!Array.isArray(value)) return unavailable;
  const records: Adjustment[] = [], ids = new Set<string>();
  for (const item of value.slice(0, 100)) {
    const a = record(item), totals = record(a.totals);
    if (typeof a.id !== "string" || !/^adj_[a-z0-9]{26}$/.test(a.id) || ids.has(a.id) ||
      a.transaction_id !== transactionId || typeof a.action !== "string" ||
      !["credit", "refund", "chargeback", "chargeback_reverse", "chargeback_warning", "chargeback_warning_reverse", "credit_reverse"].includes(a.action) ||
      typeof a.status !== "string" || !["pending_approval", "approved", "rejected", "reversed"].includes(a.status) ||
      typeof a.type !== "string" || !["full", "partial"].includes(a.type) ||
      typeof a.currency_code !== "string" || !/^[A-Z]{3}$/.test(a.currency_code)) return unavailable;
    ids.add(a.id);
    const date = typeof a.created_at === "string" && a.created_at.length <= 40 && /^\d{4}-\d{2}-\d{2}T/.test(a.created_at)
      ? new Date(a.created_at) : null;
    records.push({ id: a.id, action: a.action, type: a.type, status: a.status, currency: a.currency_code,
      totalCents: totals.currency_code === a.currency_code ? cents(totals.total) : null,
      createdAt: date && !Number.isNaN(date.getTime()) ? date.toISOString() : null });
  }
  return { available: true, truncated: value.length > 100, records };
}

export async function readSandboxTransaction(transactionId: string) {
  if (!/^txn_[a-z0-9]{26}$/.test(transactionId)) throw new Error("Invalid transaction.");
  const config = paddleSandboxApiConfig();
  const response = await fetch(`${config.apiBase}/transactions/${transactionId}?include=adjustments`, {
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
  const custom = record(txn.custom_data);
  const checkoutId = typeof custom.qatools_checkout_id === "string" &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(custom.qatools_checkout_id)
    ? custom.qatools_checkout_id : null;
  return { id: transactionId, status: txn.status, currency: txn.currency_code,
    totalCents: totals.currency_code === txn.currency_code ? cents(totals.grand_total) : null,
    balanceCents: totals.currency_code === txn.currency_code ? cents(totals.balance) : null,
    checkoutId, sandboxAttribution: custom.qatools_environment === "sandbox",
    adjustments: adjustmentHistory(txn.adjustments, transactionId) };
}
