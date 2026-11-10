"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { readDraftRecoveryMetadata } from "@/lib/adminDraftRecovery";
import AdminSiteLogo from "./AdminSiteLogo";
import "./AdminDashboard.css";

type Counts = Database["public"]["Functions"]["read_admin_dashboard_counts"]["Returns"];

export default function AdminDashboard({ userId }: { userId: string }) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error || data.session?.user.id !== userId) throw new Error("Please log in again.");
        const response = await fetch("/api/admin/dashboard", {
          cache: "no-store",
          signal: controller.signal,
          headers: { Authorization: "Bearer " + data.session.access_token },
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Unable to load dashboard counts.");
        if (!controller.signal.aborted) setCounts(body);
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to load dashboard counts.");
      }
    }
    void load();
    return () => controller.abort();
  }, [revision, userId]);

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

    {error && <div role="alert" className="admin-dashboard-error">
      <p>{error}</p>
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
  </section>;
}
