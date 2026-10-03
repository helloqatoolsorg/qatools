"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ProductDownload({ productId }: { productId: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function download() {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const session = await supabase.auth.getSession();
      if (session.error || !session.data.session) throw new Error("Please log in to download this item.");
      const response = await fetch("/api/account/download", {
        method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.data.session.access_token },
        body: JSON.stringify({ productId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to prepare this download.");
      const link = document.createElement("a");
      link.href = result.url;
      link.referrerPolicy = "no-referrer";
      document.body.appendChild(link); link.click(); link.remove();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to prepare this download."); }
    finally { setBusy(false); }
  }
  return <span>
    <button type="button" onClick={download} disabled={busy} style={{ border: "1px solid #333", background: "transparent", padding: "9px 11px", color: "#999", font: "8px monospace", cursor: busy ? "wait" : "pointer" }}>{busy ? "PREPARING..." : "DOWNLOAD"}</button>
    {error && <span role="alert" style={{ display: "block", color: "#e86565", font: "10px monospace", marginTop: "8px" }}>{error}</span>}
  </span>;
}
