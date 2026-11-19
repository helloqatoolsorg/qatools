"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { readDraftRecoveryMetadata } from "@/lib/adminDraftRecovery";
import { formatOrderNumber } from "@/lib/orderNumber";
import { renderAdminProductCard, type AdminProductCardData } from "./AdminProductCatalog";
import "./AdminProducts.css";
import AdminSiteLogo from "./AdminSiteLogo";
import "./AdminDashboard.css";

type Counts = Database["public"]["Functions"]["read_admin_dashboard_counts"]["Returns"];

type Product = AdminProductCardData & { labels: string[] };
type Order = Pick<Database["public"]["Functions"]["read_admin_orders"]["Returns"]["orders"][number],
  "id" | "order_number" | "customerEmail" | "status" | "total" | "currency" | "created_at">;
type RecentActivity = { products: Product[] | null; orders: Order[] | null };

function activityDate(value: string) {
  return new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

function orderTotal(order: Order) {
  try { return new Intl.NumberFormat("en-GB", { style: "currency", currency: order.currency }).format(order.total); }
  catch { return order.total + " " + order.currency; }
}

export default function AdminDashboard({ userId }: { userId: string }) {
  const [recent, setRecent] = useState<RecentActivity>();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error || data.session?.user.id !== userId) throw new Error("Please log in again.");
        async function read(url: string) {
          const response = await fetch(url, {
            cache: "no-store",
            signal: controller.signal,
            headers: { Authorization: "Bearer " + data.session?.access_token },
          });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error ?? "Unable to load dashboard data.");
          return body;
        }
        const [countResult, recentResult] = await Promise.allSettled([
          read("/api/admin/dashboard"), read("/api/admin/dashboard/recent"),
        ]);
        if (controller.signal.aborted) return;
        setRecent(recentResult.status === "fulfilled" ? recentResult.value : { products: null, orders: null });
        if (countResult.status === "rejected") throw countResult.reason;
        setCounts(countResult.value);
      } catch (reason) {
        if (controller.signal.aborted) return;
        setRecent(value => value ?? { products: null, orders: null });
        setError(reason instanceof Error ? reason.message : "Unable to load dashboard counts.");
      }
    }
    void load();
    return () => controller.abort();
  }, [revision, userId]);

  const recentUnavailable = recent?.products === null || recent?.orders === null;

  return <section className="admin-dashboard" aria-label="Dashboard">
    <div className="admin-dashboard-actions">
      <AdminSiteLogo />
      <div className="admin-product-entry-actions">
        <a className="card admin-new-product" href="/admin/products/edit?new=1" onClick={event => {
          let protectRecovery = true;
          try { protectRecovery = Boolean(readDraftRecoveryMetadata(userId)); } catch { /* Recovery storage unavailable. */ }
          if (protectRecovery && !window.confirm("Start a new product? Save any unfinished product first if you want to keep its recovery copy.")) {
            event.preventDefault();
          }
        }}>＋ Create new product</a>
      </div>
    </div>

    {(error || recentUnavailable) && <div className="admin-dashboard-error">
      {error && <p role="alert">{error}</p>}
      <button type="button" className="admin-logo-update" onClick={() => { setError(null); setRevision(value => value + 1); }}>Retry</button>
    </div>}
    <div className="admin-count-grid" aria-busy={!counts && !error}>
      <div title="Successful download-link requests, including repeats">
        <span>Downloads</span><strong>{counts?.downloads.toLocaleString() ?? "—"}</strong>
      </div>
      <div><span>Users</span><strong>{counts?.users.toLocaleString() ?? "—"}</strong></div>
      <div className="admin-paid-activations" title="Active paid tool licenses on activated accounts">
        <span>Paid tool activations</span><strong>{counts?.paidToolActivations.toLocaleString() ?? "—"}</strong>
      </div>
    </div>

    <section className="admin-recent admin-products" aria-labelledby="recent-products-heading">
      <h2 id="recent-products-heading">Recent products</h2>
      {recent?.products?.length ? <div className="product-grid-container"><div className="product-grid admin-product-grid">
        {recent.products.map(product => renderAdminProductCard(product, product.labels, event => {
          try {
            const recovery = readDraftRecoveryMetadata(userId);
            if (!recovery || recovery.id === product.id) return;
          } catch { /* Recovery storage unavailable. */ }
          if (!window.confirm("Open another product? Save any unfinished product first if you want to keep its recovery copy.")) {
            event.preventDefault();
          }
        }))}
      </div></div> : <p role={recent?.products === null ? "alert" : "status"}>
        {recent?.products === null ? "Unable to load recent products." : recent ? "No products yet." : "Loading recent products…"}
      </p>}
    </section>

    <section className="admin-recent" aria-labelledby="recent-orders-heading">
      <h2 id="recent-orders-heading">Recent orders</h2>
      {recent?.orders?.length ? <ul>
        {recent.orders.map(order => <li className="admin-recent-order" key={order.id}>
          <strong>{formatOrderNumber(order.order_number)}</strong>
          <span>{order.customerEmail ?? "Email unavailable"}</span>
          <span className={"order-state order-state-" + order.status}>{order.status.replaceAll("_", " ")}</span>
          <span>{orderTotal(order)}</span>
          <time dateTime={order.created_at}>{activityDate(order.created_at)}</time>
        </li>)}
      </ul> : <p role={recent?.orders === null ? "alert" : "status"}>
        {recent?.orders === null ? "Unable to load recent orders." : recent ? "No orders yet." : "Loading recent orders…"}
      </p>}
    </section>
  </section>;
}
