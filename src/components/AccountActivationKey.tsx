"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Credential = { id: string; key_prefix: string; created_at: string; updated_at: string; reveal_available: boolean };

export default function AccountActivationKey() {
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
      setMessage("Your key is ready. You can reveal or copy it here whenever you need it.");
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
        try { await navigator.clipboard.writeText(result.key); setMessage("Activation key copied."); }
        catch { setSecret(result.key); setMessage("Select the revealed key and copy it manually."); }
      }
    } catch (reason) {
      setSecret(null);
      setError(reason instanceof Error ? reason.message : "Unable to retrieve your key. Please try again.");
    } finally { inFlight.current = false; setBusy(false); }
  }

  return <div className="profile-form password-form" aria-label="Account activation key">
    <p>Machine limit: 1 active computer per account, shared by all your owned tools. Contact support to move your activation to another computer.</p>
    <h2>Account activation key</h2>
    <p className="user-muted">One key for all tools you own, independent of the Houdini version. You can reveal or copy it here whenever you need it.</p>
    <p className="user-muted">You can prepare your key now. Activation inside Houdini is coming in the next integration step.</p>
    {loading ? <p role="status">Loading key status...</p> : <>
      {credential && <p>Current key: <code>{credential.key_prefix}…</code></p>}
      {credential && !credential.reveal_available && <p className="user-muted">This older key cannot be revealed. Replace it once to enable Reveal and Copy. Your owned tools and assigned computer will be kept.</p>}
      {secret && <label>Your activation key
        <input type="text" readOnly value={secret} autoComplete="off" spellCheck={false} onFocus={event => event.target.select()} />
      </label>}
      {credential?.reveal_available && <div>
        <button type="button" disabled={busy || Boolean(error)} onClick={() => secret ? setSecret(null) : accessKey("reveal")}>{secret ? "HIDE KEY" : "REVEAL KEY"}</button>
        <button type="button" disabled={busy || Boolean(error)} onClick={() => accessKey("copy")}>COPY KEY</button>
      </div>}
      {!error && !confirming && <button type="button" disabled={busy} onClick={() => credential ? setConfirming(true) : create()}>
        {busy ? "PLEASE WAIT..." : credential ? "REPLACE ACTIVATION KEY" : "CREATE ACTIVATION KEY"}
      </button>}
      {confirming && <div>
        <p>Replace your account activation key? The old key will stop working for online activation. Your owned tools and assigned computer will be kept. Existing offline licenses are not immediately disabled.</p>
        <button type="button" disabled={busy} onClick={create}>{busy ? "REPLACING..." : "CONFIRM REPLACEMENT"}</button>
        <button type="button" disabled={busy} onClick={() => setConfirming(false)}>CANCEL</button>
      </div>}
    </>}
    {error && <div role="alert"><p className="password-error">{error}</p><button type="button" disabled={busy || loading} onClick={() => setRefresh(value => value + 1)}>REFRESH KEY STATUS</button></div>}
    {message && <p role="status" className="password-success">{message}</p>}
  </div>;
}
