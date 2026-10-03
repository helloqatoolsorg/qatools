"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export type AdminActivation = {
  id: string | number;
  machine_id: string;
  status: string;
  activated_at: string;
  released_at: string | null;
  released_by: string | null;
};

function date(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

export default function AdminActivationHistory({ activations, legacy = false, onReleased, onRefresh }: {
  activations: AdminActivation[];
  legacy?: boolean;
  onReleased?: (activation: AdminActivation) => void;
  onRefresh?: () => void;
}) {
  const [confirming, setConfirming] = useState<string | number | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const active = !legacy && activations.find(a => a.status === "active");

  async function release() {
    if (!active || confirming !== active.id || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null); setMessage(null);
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session) { setError("Please log in again before releasing a machine."); return; }
      const response = await fetch("/api/admin/account-activations/release", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ activationId: active.id }),
      });
      const result = await response.json();
      if (!response.ok) { setError(result.error ?? "Unable to release this machine."); return; }
      onReleased?.(result.activation);
      setConfirming(null);
      setMessage("Account machine released for all owned tools. Ownership and history are retained.");
    } catch { setError("Unable to reach the server. Refresh the customer list to check whether the release completed before retrying."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  if (activations.length === 0 && legacy) return null;
  return <div className="admin-activation-history">
    {!legacy && <p><strong>ACCOUNT MACHINE</strong>: {active ? active.machine_id : "NOT ACTIVATED"} — shared across owned tools.</p>}
    {active && confirming !== active.id && <button type="button" onClick={() => { setConfirming(active.id); setError(null); setMessage(null); }}>RELEASE MACHINE</button>}
    {active && confirming === active.id && <div className="admin-release-confirm">
      <p>Release machine <strong>{active.machine_id}</strong> for <strong>all tools owned by this account</strong>?</p>
      <p>Ownership and history will be kept. This does not disable an offline license already saved in Houdini.</p>
      <button type="button" disabled={busy} onClick={release}>{busy ? "RELEASING..." : "CONFIRM RELEASE"}</button>
      <button type="button" disabled={busy} onClick={() => setConfirming(null)}>CANCEL</button>
    </div>}
    {error && <div role="alert"><p className="password-error">{error}</p><button type="button" disabled={busy} onClick={onRefresh}>REFRESH CUSTOMERS</button></div>}
    {message && <p role="status" className="password-success">{message}</p>}
    <details>
      <summary>{legacy ? "Legacy per-tool history" : "Account activation history"} ({activations.length})</summary>
      {legacy && <p>Historical records before account machine management. These statuses do not describe the current account machine.</p>}
      {[...activations].sort((a,b) => Date.parse(b.activated_at) - Date.parse(a.activated_at)).map(a => <div key={a.id} className="admin-activation-record">
        <strong>{a.machine_id}</strong> <span>{a.status.toUpperCase()}</span>
        <div>Activated: {date(a.activated_at)}</div>
        {a.released_at && <div>Released: {date(a.released_at)}</div>}
        {a.released_by && <div>Released by admin: {a.released_by}</div>}
      </div>)}
    </details>
  </div>;
}
