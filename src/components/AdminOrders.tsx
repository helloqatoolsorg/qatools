"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatOrderNumber } from "@/lib/orderNumber";
import AdminPaddleCheck from "./AdminPaddleCheck";
import "./AdminOrders.css";

type Order = {
  id: number; order_number: string | null; user_id: string; customerName: string | null; customerEmail: string | null;
  provider: string; provider_order_id: string | null; provider_transaction_id: string | null;
  status: string; currency: string; subtotal: number; total: number;
  created_at: string; provider_created_at: string | null;
  items: { id: number; product_id: number; quantity: number; unit_price: number;
    product: { id: number; name: string; slug: string } | null }[];
};
function money(amount: number, currency: string) {
  try { return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount); }
  catch { return `${amount.toFixed(2)} ${currency}`; }
}
function date(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString("en-GB");
}
export default function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("date");
  const [direction, setDirection] = useState("desc");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError(null);
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !data.session) throw new Error("Please log in again to view orders.");
        const response = await fetch(`/api/admin/orders?page=${page}&status=${status}&sort=${sort}&direction=${direction}`, {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
          cache: "no-store", signal: controller.signal,
        });
        const result = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error(result.error ?? "Unable to load orders.");
        setOrders(result.orders); setHasMore(result.hasMore);
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to load orders.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    load();
    return () => controller.abort();
  }, [page, status, sort, direction, refresh]);

  return <section className="admin-orders" aria-labelledby="orders-heading">
    <div className="admin-orders-heading">
      <div><span className="admin-orders-kicker">SALES</span><h2 id="orders-heading">Orders</h2></div>
      <div className="admin-orders-controls">
        <label>Status <select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
          <option value="all">All statuses</option>
          {['pending', 'paid', 'refunded', 'partially_refunded', 'cancelled'].map(value =>
            <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}
        </select></label>
        <label>Sort <select value={sort} onChange={event => { setSort(event.target.value); setPage(1); }}>
          {[["number", "Number"], ["email", "Customer email"], ["state", "State"], ["price", "Price"], ["date", "Date"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <button type="button" aria-label={direction === "asc" ? "Sort descending" : "Sort ascending"} onClick={() => { setDirection(value => value === "asc" ? "desc" : "asc"); setPage(1); }}>{direction === "asc" ? "↑ ASC" : "↓ DESC"}</button>
        <button type="button" disabled={loading} onClick={() => setRefresh(value => value + 1)}>REFRESH ORDERS</button>
      </div>
    </div>
    {loading ? <p role="status">Loading orders…</p> : error ? <p role="alert" className="admin-orders-error">{error}</p> : <>
      {orders.length === 0 ? <p>No orders found{status !== 'all' ? ' with this status' : ''}.</p> :
        <div className="admin-orders-list"><div className="admin-orders-columns">
          {[["number", "Number"], ["email", "Customer email"], ["state", "State"], ["price", "Price"], ["date", "Date"]].map(([key, label]) => <button type="button" key={key} onClick={() => { if (sort === key) setDirection(value => value === "asc" ? "desc" : "asc"); else { setSort(key); setDirection("asc"); } setPage(1); }}>{label}{sort === key ? (direction === "asc" ? " ↑" : " ↓") : ""}</button>)}
        </div>{orders.map(order => <details key={order.id}>
          <summary><span>{formatOrderNumber(order.order_number)}</span><span>{order.customerEmail ?? 'Email unavailable'}</span>
            <span className={"order-state order-state-" + order.status}>{order.status.replaceAll('_', ' ')}</span><span>{money(order.total, order.currency)}</span>
            <time dateTime={order.created_at}>{date(order.created_at)}</time></summary>
          <div className="admin-order-details">
            <dl><dt>Customer email</dt><dd>{order.customerEmail ?? "—"}</dd><dt>Customer name</dt><dd>{order.customerName ?? "—"}</dd><dt>Customer ID</dt><dd>{order.user_id}</dd><dt>Provider</dt><dd>{order.provider}</dd>
              <dt>Provider order</dt><dd>{order.provider_order_id ?? '—'}</dd>
              <dt>Provider transaction</dt><dd>{order.provider_transaction_id ?? '—'}</dd>
              <dt>Subtotal</dt><dd>{money(order.subtotal, order.currency)}</dd>
              <dt>Total</dt><dd>{money(order.total, order.currency)}</dd>
              {order.provider_created_at && <><dt>Provider date</dt><dd>{date(order.provider_created_at)}</dd></>}
            </dl>
            {order.provider === "paddle_sandbox" && order.provider_transaction_id &&
              <AdminPaddleCheck transactionId={order.provider_transaction_id} />}
            {order.items.length ? <div className="admin-order-items"><table>
              <thead><tr><th>Item</th><th>Quantity</th><th>Unit price</th><th>Line total</th></tr></thead>
              <tbody>{order.items.map(item => <tr key={item.id}><td>{item.product?.name ?? `Product #${item.product_id}`}</td>
                <td>{item.quantity}</td><td>{money(item.unit_price, order.currency)}</td>
                <td>{money(item.unit_price * item.quantity, order.currency)}</td></tr>)}</tbody>
            </table></div> : <p>No items recorded for this order.</p>}
          </div>
        </details>)}</div>}
    </>}
    <div className="admin-orders-paging">
      <button type="button" disabled={loading || page === 1} onClick={() => setPage(value => value - 1)}>PREVIOUS</button>
      <span>Page {page}</span>
      <button type="button" disabled={loading || Boolean(error) || !hasMore} onClick={() => setPage(value => value + 1)}>NEXT</button>
    </div>
  </section>;
}
