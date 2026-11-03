"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function AccountTrial() {
  const [message, setMessage] = useState("Loading trial status…");
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const {data} = await supabase.auth.getSession();
        if (!data.session) return;
        const response = await fetch("/api/account/trial",{headers:{Authorization:`Bearer ${data.session.access_token}`},cache:"no-store",signal:controller.signal});
        const result = await response.json();
        if (!response.ok) throw new Error();
        setMessage(!result.trial ? "Your seven-day trial starts with your first activation in Houdini." : Date.parse(result.trial.endsAt) <= Date.now() ? "Trial ended. Free and purchased tools remain available." : `Trial ends ${new Date(result.trial.endsAt).toLocaleString()}. Free and purchased tools remain available afterwards.`);
      } catch { if (!controller.signal.aborted) setMessage("Unable to load trial status. Refresh to try again."); }
    }
    load(); return () => controller.abort();
  }, []);
  return <p style={{fontSize:12,color:"#aaa",lineHeight:1.6}}>{message} Projects are not included in the trial.</p>;
}
