"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { FinanceReport } from "@/lib/adminFinance";
import "./AdminFinance.css";

const periods = [["month", "Last 30 days"], ["3months", "Last 3 months"], ["6months", "Last 6 months"], ["year", "Last 12 months"]];
function money(amount: number, currency: string) {
  try { return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount); }
  catch { return `${amount.toFixed(2)} ${currency}`; }
}
function date(value: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "2-digit" }).format(new Date(value));
}

export default function AdminFinance() {
  const [environment, setEnvironment] = useState("sandbox");
  const [period, setPeriod] = useState("month");
  const [report, setReport] = useState<FinanceReport | null>(null);
  const [currency, setCurrency] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [metric, setMetric] = useState<"payments" | "refunds" | "remaining">("remaining");
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError(null); setReport(null);
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !data.session) throw new Error("Please log in again to view finance.");
        const response = await fetch(`/api/admin/finance?environment=${environment}&period=${period}`, {
          headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: "no-store", signal: controller.signal,
        });
        const result = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error(result.error ?? "Unable to load finance.");
        setReport(result);
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to load finance.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    load();
    return () => controller.abort();
  }, [environment, period, refresh]);
  const summary = report?.currencies.find(value => value.currency === currency) ?? report?.currencies[0];
  const weekly = ["6months", "year"].includes(period);
  const max = Math.max(1, ...(summary?.points.map(point => Math.abs(point[metric])) ?? []));
  return <section className="admin-finance" aria-labelledby="finance-heading">
    <div className="finance-heading"><div><span className="finance-kicker">SALES REPORT</span><h2 id="finance-heading">Finance</h2></div>
      <div className="finance-controls">
        <label>Environment <select value={environment} onChange={event => setEnvironment(event.target.value)}><option value="sandbox">Sandbox</option><option value="live">Live</option></select></label>
        <label>Period <select value={period} onChange={event => setPeriod(event.target.value)}>{periods.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <button type="button" disabled={loading} onClick={() => setRefresh(value => value+1)}>REFRESH FINANCE</button>
      </div>
    </div>
    {environment === "sandbox" && <p className="finance-notice">Sandbox test transactions. These amounts are not real revenue.</p>}
    <p className="finance-description">Customer payments include tax where charged. Refunds reflect recorded full-order or full-item refunds. Remaining payments are after those refunds, before tax, fees and payouts.</p>
    {loading ? <p role="status">Loading finance…</p> : error ? <p role="alert" className="finance-error">{error}</p> : !summary ? <p>No completed {environment} orders recorded.</p> : <>
      {report && report.currencies.length > 1 && <label className="finance-currency">Currency <select value={summary.currency} onChange={event => setCurrency(event.target.value)}>{report.currencies.map(value => <option key={value.currency}>{value.currency}</option>)}</select></label>}
      <div className="finance-stats">{[["All-time customer payments",summary.payments],["Recorded refunds",summary.refunds],["Remaining payments",summary.remaining],["Last 30 days · remaining",summary.last30DaysRemaining]].map(([label,value]) => <div className="finance-stat" key={String(label)}><span>{label}</span><strong>{money(Number(value),summary.currency)}</strong></div>)}</div>
      <p>{summary.orders} completed orders · {summary.refundedOrders} orders with recorded refunds · {summary.periodOrders} orders in selected period</p>
      {summary.reviewOrders>0 && <p role="status" className="finance-notice">{summary.reviewOrders} orders have inconsistent refund records. Totals require reconciliation in Payment review.</p>}
      <div className="finance-chart-heading"><h3>Payments by purchase date</h3><label>Show <select value={metric} onChange={event => setMetric(event.target.value as typeof metric)}><option value="remaining">Remaining payments</option><option value="payments">Customer payments</option><option value="refunds">Recorded refunds</option></select></label></div>
      <p className="finance-description">UTC · {report?.startDate} to {report?.endDate}. Refunds update the original purchase period; this is not a refund-date cash-flow chart. Rolling periods include today. {weekly ? "Each column covers seven days from the start of the period; the final week may be shorter." : "Each column covers one day."}</p>
      <div className="finance-chart-scroll"><div className="finance-chart" role="img" aria-label={`${metric === "remaining" ? "Remaining payments" : metric === "refunds" ? "Recorded refunds" : "Customer payments"} in ${summary.currency}, by ${weekly ? "week" : "day"}. Exact amounts are listed below.`}>
        {summary.points.map(point => <div className="finance-chart-column" key={point.date} title={`${date(point.date)}${weekly ? ` – ${date(point.endDate)}` : ""}: ${money(point[metric],summary.currency)}`}><div className="finance-bar-track"><div className={`finance-bar ${metric === "refunds" ? "finance-bar-refund" : ""}`} style={{ height: `${Math.abs(point[metric])/max*100}%` }} /></div><span>{date(point.date)}</span></div>)}
      </div></div>
      <div className="finance-period-summary">Selected period: {money(summary.periodPayments,summary.currency)} payments · {money(summary.periodRefunds,summary.currency)} refunds · {money(summary.periodRemaining,summary.currency)} remaining</div>
      <details className="finance-table"><summary>Show exact amounts</summary><div><table><thead><tr><th>{weekly ? "Week" : "Day"} (UTC)</th><th>Orders</th><th>Payments</th><th>Refunds</th><th>Remaining</th></tr></thead><tbody>{summary.points.map(point => <tr key={point.date}><td>{date(point.date)}{weekly ? ` – ${date(point.endDate)}` : ""}</td><td>{point.orders}</td><td>{money(point.payments,summary.currency)}</td><td>{money(point.refunds,summary.currency)}</td><td>{money(point.remaining,summary.currency)}</td></tr>)}</tbody></table></div></details>
      <p className="finance-description">Based on stored completed orders, including refunded orders. Pending/cancelled orders and free acquisitions are excluded. Unsupported partial monetary refunds and disputes may require Paddle reconciliation. Currency totals are never converted or combined. Live figures do not establish live checkout readiness.</p>
      {report && <p className="finance-description">Updated {new Date(report.generatedAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC</p>}
    </>}
  </section>;
}
