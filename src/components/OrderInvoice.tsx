"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function OrderInvoice({ orderId }: { orderId: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); }, [orderId]);

  async function download() {
    if (busy) return;
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setError(null);
    try {
      const session = await supabase.auth.getSession();
      if (controller.signal.aborted) return;
      if (session.error || !session.data.session) throw new Error("Please log in to download your invoice.");
      const response = await fetch("/api/account/invoice?orderId=" + encodeURIComponent(orderId), {
        headers: { Authorization: "Bearer " + session.data.session.access_token },
        cache: "no-store", signal: controller.signal,
      });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(result.error ?? "Unable to prepare your invoice.");
      const url = new URL(result.url);
      if (url.protocol !== "https:" || url.username || url.password) throw new Error("Unable to prepare your invoice.");
      const link = document.createElement("a");
      link.href = url.href; link.referrerPolicy = "no-referrer";
      document.body.appendChild(link); link.click(); link.remove();
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to prepare your invoice.");
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }

  return <span style={{ display: "block", marginTop: "10px" }}>
    <button type="button" onClick={download} disabled={busy}
      style={{ border: "1px solid #333", background: "transparent", padding: "9px 11px", color: "#999", font: "8px monospace", cursor: busy ? "wait" : "pointer" }}>
      {busy ? "PREPARING..." : "DOWNLOAD INVOICE"}
    </button>
    {error && <span role="alert" style={{ display: "block", color: "#e86565", font: "10px monospace", marginTop: "8px" }}>{error}</span>}
  </span>;
}
