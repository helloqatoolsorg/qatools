"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatOrderNumber } from "@/lib/orderNumber";
import type { PaymentComparison } from "@/lib/paymentComparison";

type Check = {
  transaction: { status: string; currency: string; totalCents: string | null; balanceCents: string | null;
    checkoutId: string | null; sandboxAttribution: boolean; environmentAttribution?: boolean; environment?: "sandbox" | "live";
    adjustments: { available: boolean; truncated: boolean; records: {
      id: string; action: string; type: string; status: string; currency: string;
      totalCents: string | null; createdAt: string | null;
    }[] } };
  order: { order_number: string | null; status: string; currency: string; total: number } | null;
  checkout: { id: string; status: string } | null;
  checkedAt: string;
  comparison: PaymentComparison;
};
function amount(cents: string | null, currency: string) {
  if (cents === null) return "Unavailable";
  // Current store supports EUR; avoid guessing other currencies' decimal precision.
  return currency === "EUR" ? `${(Number(cents) / 100).toFixed(2)} EUR` : `${cents} minor units (${currency})`;
}

export default function AdminPaddleCheck({ transactionId, environment = "sandbox" }: { transactionId: string; environment?: "sandbox" | "live" }) {
  const [result, setResult] = useState<Check | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); }, [transactionId, environment]);

  async function check() {
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    setLoading(true); setError(null); setResult(null);
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (controller.signal.aborted) return;
      if (sessionError || !data.session) throw new Error("Please log in again to check Paddle.");
      const response = await fetch(`/api/admin/payment-review/transaction?id=${encodeURIComponent(transactionId)}&environment=${environment}`, {
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
        <dt>{environment === "live" ? "Live" : "Sandbox"} attribution</dt><dd>{(result.transaction.environmentAttribution ?? result.transaction.sandboxAttribution) ? "Present" : "Missing"}</dd>
        <dt>Paddle checkout ID</dt><dd>{result.transaction.checkoutId ?? "—"}</dd>
        <dt>Saved checkout</dt><dd>{result.checkout ? `${result.checkout.id} (${result.checkout.status})` : "No saved checkout"}</dd>
        <dt>Saved order</dt><dd>{result.order ? `${formatOrderNumber(result.order.order_number)} (${result.order.status})` : "No saved order"}</dd>
        <dt>Saved order total</dt><dd>{result.order ? `${Number(result.order.total).toFixed(2)} ${result.order.currency}` : "—"}</dd>
        <dt>Checked</dt><dd>{new Date(result.checkedAt).toLocaleString("en-GB")}</dd>
      </dl>
      <h3>Saved record comparison</h3>
      <dl>{result.comparison.map(check => <div key={check.label} style={{ display: "contents" }}>
        <dt>{check.label}</dt><dd className={check.state === "mismatch" ? "admin-orders-error" : undefined}>
          {check.state === "match" ? "Matches" : check.state === "mismatch" ? "Does not match — review required" : "Unavailable"}
        </dd>
      </div>)}</dl>
      <p>These checks compare references and amounts. They do not resolve refunds or disputes.</p>
      <h3>Refunds and adjustments</h3>
      {!result.transaction.adjustments.available ? <p role="alert" className="admin-orders-error">
        Adjustment details are unavailable. Check the matching Paddle dashboard before taking action.
      </p> : result.transaction.adjustments.records.length === 0 ? <p>No adjustments returned by Paddle.</p> : <>
        {result.transaction.adjustments.truncated && <p role="alert">Showing the first 100 adjustments. Check Paddle for the remaining history.</p>}
        <div className="admin-order-items"><table>
          <thead><tr><th>Action</th><th>Scope</th><th>Status</th><th>Amount</th><th>Date</th><th>Reference</th></tr></thead>
          <tbody>{result.transaction.adjustments.records.map(adjustment => <tr key={adjustment.id}>
            <td>{adjustment.action.replaceAll("_", " ")}</td><td>{adjustment.type}</td>
            <td>{adjustment.status.replaceAll("_", " ")}</td><td>{amount(adjustment.totalCents, adjustment.currency)}</td>
            <td>{adjustment.createdAt ? new Date(adjustment.createdAt).toLocaleString("en-GB") : "Unavailable"}</td>
            <td>{adjustment.id}</td>
          </tr>)}</tbody>
        </table></div>
      </>}
      <p>This check does not issue refunds or change orders or ownership.</p>
    </div>}
  </div>;
}
