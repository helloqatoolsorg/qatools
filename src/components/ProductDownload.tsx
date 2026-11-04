"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useQAToolsState } from "@/context/QAToolsState";

export default function ProductDownload({ productId, label = "DOWNLOAD", buttonClassName }: { productId: number; label?: string; buttonClassName?: string }) {
  const { user, loading } = useAuth();
  const pendingLogin = useRef(false);
  const inFlight = useRef(false);
  const button = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const {isDownloaded,markDownloaded}=useQAToolsState();
  const downloaded=isDownloaded(productId);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const cancel = () => { pendingLogin.current = false; };
    window.addEventListener("qatools:login-cancelled", cancel);
    return () => window.removeEventListener("qatools:login-cancelled", cancel);
  }, []);
  const download = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError(null);
    try {
      const session = await supabase.auth.getSession();
      if (session.error) throw new Error("Unable to check your account. Please try again.");
      if (!session.data.session) {
        pendingLogin.current = true;
        window.dispatchEvent(new CustomEvent("qatools:login", {detail:{anchor:button.current}}));
        return;
      }
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
      markDownloaded(productId);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to prepare this download."); }
    finally { inFlight.current = false; setBusy(false); }
  }, [productId,markDownloaded]);
  useEffect(() => {
    if (user && pendingLogin.current) {
      pendingLogin.current = false;
      void download();
    }
  }, [user, download]);
  return <span className="product-download-control">
    <button ref={button} type="button" onClick={() => void download()} disabled={busy || loading} className={[buttonClassName, label === "FREE DOWNLOAD" ? "free-download-button" : "", downloaded ? "downloaded" : ""].filter(Boolean).join(" ")} style={buttonClassName ? undefined : { border: "1px solid #333", background: "transparent", padding: "9px 11px", color: label === "FREE DOWNLOAD" ? "#68c990" : "#999", font: "8px monospace", cursor: busy ? "wait" : "pointer" }}>{busy ? "PREPARING..." : downloaded ? "DOWNLOADED" : label}</button>
    {error && <span role="alert" style={{ display: "block", color: "#e86565", font: "10px monospace", marginTop: "8px" }}>{error}</span>}
  </span>;
}
