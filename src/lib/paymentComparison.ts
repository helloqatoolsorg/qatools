type Transaction = { status: string; currency: string; totalCents: string | null;
  balanceCents: string | null; checkoutId: string | null; sandboxAttribution: boolean; environment?: "sandbox" | "live"; environmentAttribution?: boolean };
type Order = { currency: string; total: number | string };
type Checkout = { id: string; currency: string; amount_cents: number; charged_amount_cents?: number | null };
export type PaymentComparison = { label: string; state: "match" | "mismatch" | "unavailable" }[];
function orderCents(total: number | string): string | null {
  const value = String(total);
  if (!/^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return String(BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0")));
}
export function comparePayment(transaction: Transaction, order: Order | null, checkout: Checkout | null): PaymentComparison {
  const checkoutAmount = checkout?.charged_amount_cents ?? checkout?.amount_cents;
  const compare = (label: string, actual: string | null, expected: string | null) => ({ label,
    state: actual === null || expected === null ? "unavailable" as const : actual === expected ? "match" as const : "mismatch" as const });
  const result: PaymentComparison = [
    { label: transaction.environment === "live" ? "Live attribution" : "Sandbox attribution", state: (transaction.environmentAttribution ?? transaction.sandboxAttribution) ? "match" : "mismatch" },
    compare("Checkout reference", transaction.checkoutId, checkout?.id ?? null),
    compare("Order currency", transaction.currency, order?.currency ?? null),
    compare("Checkout currency", transaction.currency, checkout?.currency ?? null),
    compare("Order total", transaction.totalCents, order && order.currency === transaction.currency ? orderCents(order.total) : null),
    compare(checkout?.charged_amount_cents != null ? "Checkout paid total" : "Checkout catalog total", transaction.totalCents,
      checkout && checkout.currency === transaction.currency && Number.isSafeInteger(checkoutAmount) ? String(checkoutAmount) : null),
  ];
  if (["paid", "completed"].includes(transaction.status)) result.push(compare("Paid transaction balance", transaction.balanceCents, "0"));
  return result;
}
