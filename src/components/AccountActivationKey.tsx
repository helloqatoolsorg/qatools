"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Credential = { id: string; key_prefix: string; created_at: string; updated_at: string; reveal_available: boolean };

export default function AccountActivationKey({ embedded = false }: { embedded?: boolean }) {
  const [credential, setCredential] = useState<Credential | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const inFlight = useRef(false);

  async function sessionToken() {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) throw new Error("Please log in again to manage your activation key.");
    return data.session.access_token;
  }

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError(null); setSecret(null); setConfirming(false); setMessage(null);
      try {
        const token = await sessionToken();
        const response = await fetch("/api/account/activation-key", {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal,
        });
        const result = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error(result.error ?? "Unable to load your activation key status.");
        setCredential(result.credential);
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to load activation key status.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    load();
    return () => controller.abort();
  }, [refresh]);

  async function create() {
    if (inFlight.current || loading || (credential && !confirming)) return;
    inFlight.current = true; setBusy(true); setError(null); setMessage(null); setSecret(null);
    try {
      const token = await sessionToken();
      const response = await fetch("/api/account/activation-key", {
        method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ expectedCredentialId: credential?.id ?? null }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to create an activation key.");
      setCredential(result.credential); setConfirming(false);
      setMessage("License key ready.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The response was interrupted. Refresh to check the key status before trying again.");
    } finally { inFlight.current = false; setBusy(false); }
  }

  async function accessKey(action: "reveal" | "copy") {
    if (inFlight.current || loading || !credential?.reveal_available) return;
    inFlight.current = true; setBusy(true); setError(null); setMessage(null);
    try {
      const token = await sessionToken();
      const response = await fetch("/api/account/activation-key/reveal", {
        method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ credentialId: credential.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to retrieve your activation key.");
      if (action === "reveal") { setSecret(result.key); }
      else {
        try { await navigator.clipboard.writeText(result.key); setMessage("License key copied."); }
        catch { setSecret(result.key); setMessage("Select the revealed key and copy it manually."); }
      }
    } catch (reason) {
      setSecret(null);
      setError(reason instanceof Error ? reason.message : "Unable to retrieve your key. Please try again.");
    } finally { inFlight.current = false; setBusy(false); }
  }

  return <div className={`account-license-key ${embedded ? "embedded" : ""}`} aria-label="License key">
    {!embedded && <h2>License key</h2>}
    {loading ? <p role="status">Loading license key…</p> : <>
      <input className="license-key-value" aria-label="License key" type="text" readOnly
        value={secret ?? (credential ? `${credential.key_prefix}••••••••••••` : "No license key yet")}
        autoComplete="off" spellCheck={false} onFocus={event => event.target.select()} />
      {credential?.reveal_available && <div className="license-key-actions">
        <button type="button" disabled={busy || Boolean(error)} onClick={() => secret ? setSecret(null) : accessKey("reveal")}>{secret ? "Hide key" : "Reveal key"}</button>
        <button type="button" disabled={busy || Boolean(error)} onClick={() => accessKey("copy")}>Copy key</button>
      </div>}
      {!credential && !error && <button type="button" disabled={busy} onClick={create}>{busy ? "Please wait…" : "Create license key"}</button>}
      {credential && <details className="license-key-manage">
        <summary>Manage key</summary>
        {!credential.reveal_available && <p>This older key needs replacing to enable Reveal and Copy.</p>}
        {!error && !confirming && <button type="button" disabled={busy} onClick={() => setConfirming(true)}>Replace key</button>}
        {confirming && <div>
          <p>The old key will stop working for online activation. Your tools and assigned computer are retained. Existing offline licenses are not immediately disabled.</p>
          <div className="license-key-actions">
            <button type="button" disabled={busy} onClick={create}>{busy ? "Replacing…" : "Confirm replacement"}</button>
            <button type="button" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        </div>}
      </details>}
    </>}
    {error && <div role="alert"><p className="password-error">{error}</p><button type="button" disabled={busy || loading} onClick={() => setRefresh(value => value + 1)}>Retry</button></div>}
    {message && <p role="status" className="password-success">{message}</p>}
  </div>;
}
