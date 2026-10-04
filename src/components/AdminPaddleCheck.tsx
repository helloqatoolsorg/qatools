"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatOrderNumber } from "@/lib/orderNumber";

type Check = {
  transaction: { status: string; currency: string; totalCents: string | null; balanceCents: string | null;
    checkoutId: string | null; sandboxAttribution: boolean };
  order: { order_number: string | null; status: string; currency: string; total: number } | null;
  checkout: { id: string; status: string } | null;
  checkedAt: string;
};
function amount(cents: string | null, currency: string) {
  if (cents === null) return "Unavailable";
  // Current store supports EUR; avoid guessing other currencies' decimal precision.
  return currency === "EUR" ? `${(Number(cents) / 100).toFixed(2)} EUR` : `${cents} minor units (${currency})`;
}

export default function AdminPaddleCheck({ transactionId }: { transactionId: string }) {
  const [result, setResult] = useState<Check | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); }, [transactionId]);

  async function check() {
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    setLoading(true); setError(null); setResult(null);
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (controller.signal.aborted) return;
      if (sessionError || !data.session) throw new Error("Please log in again to check Paddle.");
      const response = await fetch(`/api/admin/payment-review/transaction?id=${encodeURIComponent(transactionId)}`, {
        headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: "no-store", signal: controller.signal,
      });
      const body = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(body.error ?? "Unable to check Paddle.");
      setResult(body);
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to check Paddle.");
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }

  return <div>
    <button type="button" disabled={loading} onClick={check}>{loading ? "CHECKING PADDLE…" : "CHECK PADDLE STATUS"}</button>
    {error && <p role="alert" className="admin-orders-error">{error}</p>}
    {result && <div aria-live="polite">
      <dl><dt>Paddle status</dt><dd>{result.transaction.status}</dd>
        <dt>Paddle total</dt><dd>{amount(result.transaction.totalCents, result.transaction.currency)}</dd>
        <dt>Outstanding balance</dt><dd>{amount(result.transaction.balanceCents, result.transaction.currency)}</dd>
        <dt>Sandbox attribution</dt><dd>{result.transaction.sandboxAttribution ? "Present" : "Missing"}</dd>
        <dt>Paddle checkout ID</dt><dd>{result.transaction.checkoutId ?? "—"}</dd>
        <dt>Saved checkout</dt><dd>{result.checkout ? `${result.checkout.id} (${result.checkout.status})` : "No saved checkout"}</dd>
        <dt>Saved order</dt><dd>{result.order ? `${formatOrderNumber(result.order.order_number)} (${result.order.status})` : "No saved order"}</dd>
        <dt>Saved order total</dt><dd>{result.order ? `${Number(result.order.total).toFixed(2)} ${result.order.currency}` : "—"}</dd>
        <dt>Checked</dt><dd>{new Date(result.checkedAt).toLocaleString("en-GB")}</dd>
      </dl>
      <p>Transaction status does not show the full refund or dispute history. Check adjustments in Paddle before taking action.</p>
    </div>}
  </div>;
}
