"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import "./AdminOrders.css";

type ReviewRecord = {
  event_id?: string; event_type?: string; transaction_id: string | null;
  occurred_at?: string; received_at?: string;
  id?: string; user_id?: string; product_id?: number; status?: string;
  created_at?: string; updated_at?: string;
};
function date(value: string | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString("en-GB");
}

export default function AdminPaymentReview() {
  const [kind, setKind] = useState("events");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [records, setRecords] = useState<ReviewRecord[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError(null);
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !data.session) throw new Error("Please log in again to view payment review.");
        const response = await fetch(`/api/admin/payment-review?kind=${kind}&page=${page}`, {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
          cache: "no-store", signal: controller.signal,
        });
        const result = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error(result.error ?? "Unable to load payment review.");
        setRecords(result.records); setHasMore(result.hasMore);
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to load payment review.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    load();
    return () => controller.abort();
  }, [kind, page, refresh]);

  return <section className="admin-orders" aria-labelledby="payment-review-heading">
    <div className="admin-orders-heading">
      <div><span className="admin-orders-kicker">SANDBOX</span><h2 id="payment-review-heading">Payment review</h2></div>
      <div className="admin-orders-controls">
        <label>Show <select value={kind} onChange={event => { setKind(event.target.value); setPage(1); }}>
          <option value="events">Payment events requiring review</option>
          <option value="checkouts">Unconfirmed checkout attempts</option>
        </select></label>
        <button type="button" disabled={loading} onClick={() => setRefresh(value => value + 1)}>REFRESH REVIEW</button>
      </div>
    </div>
    <p>{kind === "events"
      ? "Compare these events with the matching Paddle sandbox transaction and order before taking action."
      : "Shows creating or unknown attempts unchanged for at least five minutes. This does not confirm that payment failed. Check Paddle before retrying."}</p>
    <p>This view does not change payments, orders or ownership.</p>
    {loading ? <p role="status">Loading payment review…</p> : error ? <p role="alert" className="admin-orders-error">{error}</p> :
      records.length === 0 ? <p>No {kind === "events" ? "payment events requiring review" : "unconfirmed checkout attempts"} found.</p> :
      <div className="admin-orders-list">{records.map(record => <details key={record.event_id ?? record.id}>
        <summary><span>{record.event_type ?? record.status}</span>
          <span>{record.transaction_id ?? "No transaction recorded"}</span>
          <span>{kind === "events" ? "review" : "unconfirmed"}</span><span>sandbox</span>
          <time>{date(record.received_at ?? record.updated_at)}</time></summary>
        <div className="admin-order-details"><dl>
          <dt>{kind === "events" ? "Event ID" : "Checkout ID"}</dt><dd>{record.event_id ?? record.id}</dd>
          <dt>Paddle transaction</dt><dd>{record.transaction_id ?? "—"}</dd>
          {kind === "events" ? <><dt>Event date</dt><dd>{date(record.occurred_at)}</dd>
            <dt>Received</dt><dd>{date(record.received_at)}</dd></> : <>
            <dt>Customer ID</dt><dd>{record.user_id}</dd><dt>Item ID</dt><dd>{record.product_id}</dd>
            <dt>Created</dt><dd>{date(record.created_at)}</dd><dt>Updated</dt><dd>{date(record.updated_at)}</dd>
          </>}
        </dl></div>
      </details>)}</div>}
    <div className="admin-orders-paging">
      <button type="button" disabled={loading || page === 1} onClick={() => setPage(value => value - 1)}>PREVIOUS</button>
      <span>Page {page}</span>
      <button type="button" disabled={loading || Boolean(error) || !hasMore} onClick={() => setPage(value => value + 1)}>NEXT</button>
    </div>
  </section>;
}
