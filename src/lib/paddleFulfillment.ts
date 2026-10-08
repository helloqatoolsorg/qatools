import type { PaddleEnvironment } from "./paddleEnvironment";
import "server-only";
import { validateCartTransaction } from "./paddleCartValidation";

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const paddleId = (value: unknown, prefix: string): value is string => typeof value === "string" && new RegExp(`^${prefix}_[a-z0-9]{26}$`).test(value);
const cents = (value: unknown): number | null => typeof value === "string" && /^(0|[1-9][0-9]{0,8})$/.test(value) ? Number(value) : null;

// Called only after raw-byte signature verification. Store normalized fields, not customer payloads.
export function normalizePaddleEvent(value: unknown, environment: PaddleEnvironment = "sandbox") {
  const event = record(value), data = record(event.data);
  const simulation = paddleId(event.event_id, "ntfsimevt");
  if ((!paddleId(event.event_id, "evt") && !simulation) || typeof event.event_type !== "string" ||
      !/^[a-z_]+\.[a-z_]+$/.test(event.event_type) || event.event_type.length > 80 ||
      typeof event.occurred_at !== "string" || !Number.isFinite(Date.parse(event.occurred_at))) {
    throw new Error("Invalid Paddle event.");
  }
  const type = event.event_type;
  const transaction = type.startsWith("adjustment.") ? data.transaction_id : data.id;
  const txnId = paddleId(transaction, "txn") ? transaction : null;
  const custom = record(data.custom_data), totals = record(record(data.details).totals);
  const items = Array.isArray(data.items) ? data.items : [];
  const item = record(items[0]), price = record(item.price);
  const lines = record(data.details).line_items;
  const lineArray = Array.isArray(lines) ? lines : [];
  const line = record(lineArray[0]), lineTotals = record(line.totals);
  const intentId = typeof custom.qatools_checkout_id === "string" &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(custom.qatools_checkout_id) ? custom.qatools_checkout_id : null;
  const subtotal = cents(totals.subtotal), tax = cents(totals.tax);
  const total = cents(totals.total);
  const refundTotals = record(data.totals);
  const refundTotal = cents(refundTotals.total);
  // Dashboard item-based refunds can label the adjustment partial even when its
  // only item is fully refunded. SQL still requires the exact entire order amount.
  const wholeItemRefund = data.type === "partial" && items.length === 1 && item.type === "full" &&
    paddleId(item.item_id, "txnitm") && refundTotal !== null && cents(record(item.totals).total) === refundTotal;
  const fullRefund = !simulation && ["adjustment.created", "adjustment.updated"].includes(type) &&
    !!txnId && paddleId(data.id, "adj") && data.action === "refund" && (data.type === "full" || wholeItemRefund) &&
    data.status === "approved" && data.currency_code === "EUR" && refundTotals.currency_code === "EUR" &&
    data.subscription_id === null && refundTotal !== null && refundTotal > 0;
  const cartVersion = custom.qatools_checkout_version === "cart-v1";
  let cartPayment: ReturnType<typeof validateCartTransaction> | null = null;
  if (!simulation && type === "transaction.completed" && cartVersion && txnId && intentId) {
    try { cartPayment = validateCartTransaction(data, intentId, undefined, true, environment); } catch { /* Review invalid signed payments without granting ownership. */ }
  }
  const refundItems = items.map(value => { const i = record(value); return { providerItemId: i.item_id, amount: cents(record(i.totals).total), full: i.type === "full" }; });
  const refundedTools = !simulation && ["adjustment.created", "adjustment.updated"].includes(type) && !!txnId &&
    paddleId(data.id, "adj") && data.action === "refund" && data.status === "approved" &&
    ["full", "partial"].includes(String(data.type)) && data.subscription_id === null && data.currency_code === "EUR" &&
    refundTotals.currency_code === "EUR" && refundTotal !== null && refundTotal > 0 &&
    refundItems.length > 0 && refundItems.length <= 20 &&
    refundItems.every(i => i.full && paddleId(i.providerItemId, "txnitm") && i.amount !== null && i.amount > 0) &&
    new Set(refundItems.map(i => i.providerItemId)).size === refundItems.length &&
    refundItems.reduce((sum,i) => sum + (i.amount ?? 0),0) === refundTotal;
  const valid = environment === "sandbox" && !simulation && type === "transaction.completed" && !!txnId && !!intentId &&
    custom.qatools_environment === "sandbox" && data.status === "completed" &&
    data.collection_mode === "automatic" && data.currency_code === "EUR" && totals.currency_code === "EUR" &&
    data.subscription_id === null && data.discount_id === null && items.length === 1 && item.quantity === 1 &&
    price.id === "pri_01m41bkp4f0fxgb9cfm37n5p4b" && price.product_id === "pro_01m41bf7cprd18e5aebzyp1rzw" &&
    price.billing_cycle === null && price.trial_period === null && price.tax_mode === "internal" &&
    record(price.unit_price).amount === "500" && record(price.unit_price).currency_code === "EUR" &&
    lineArray.length === 1 && line.price_id === price.id && line.quantity === 1 &&
    record(line.product).id === price.product_id && lineTotals.total === "500" && lineTotals.discount === "0" &&
    subtotal !== null && tax !== null && subtotal + tax === 500 && total === 500 &&
    totals.grand_total === "500" && totals.discount === "0" && totals.credit === "0" &&
    totals.credit_to_balance === "0" && totals.balance === "0";
  return {
    environment, eventId: event.event_id as string, type, txnId: simulation ? null : txnId, intentId: simulation ? null : intentId, valid: cartVersion ? !!cartPayment : valid,
    checkoutVersion: cartVersion ? "cart-v1" : "legacy", items: cartPayment?.items ?? [], refundedTools,
    taxAdjusted: cartPayment?.taxAdjusted ?? false,
    refundItems: refundedTools ? refundItems.map(i => ({ providerItemId: i.providerItemId as string, amount: i.amount as number })) : [],
    priceId: typeof price.id === "string" ? price.id : null,
    subtotal: cartPayment?.subtotal ?? subtotal, total: cartPayment?.total ?? total, fullRefund, refundId: fullRefund || refundedTools ? data.id as string : null,
    refundTotal: fullRefund || refundedTools ? refundTotal : null, occurredAt: new Date(event.occurred_at).toISOString(),
  };
}
