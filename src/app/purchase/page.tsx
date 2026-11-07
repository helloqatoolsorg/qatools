"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useQAToolsState } from "@/context/QAToolsState";
import { supabase } from "@/lib/supabase";

export default function PurchasePage() {
  const { user, loading } = useAuth();
  const { addToCart, cartReady, cartItems, purchasedLoading, isPurchased } = useQAToolsState();
  const [item, setItem] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    const slug = new URLSearchParams(window.location.search).get("tool") ?? "";
    if (!/^[a-z0-9][a-z0-9_-]{0,127}$/.test(slug)) { window.location.replace("/"); return; }
    supabase.from("products").select("slug").eq("slug", slug).in("product_type", ["tool", "bundle", "project"]).eq("published", true).maybeSingle().then(({data,error}) => {
      if (!cancelled) { if (error || !data) setError("This item is not available for purchase."); else setItem(data.slug); }
    });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!item || !cartReady || loading || purchasedLoading) return;
    if (user && isPurchased(item)) { window.location.replace("/user?section=purchased"); return; }
    if (!cartItems.includes(item)) { addToCart(item); return; }
    // Persist before a full navigation; the cart survives the login page.
    localStorage.setItem("qatools_cart", JSON.stringify(cartItems));
    window.location.replace(user ? "/cart" : "/user?purchase=" + encodeURIComponent(item));
  }, [item, cartReady, loading, purchasedLoading, user, cartItems, addToCart, isPurchased]);
  return <main style={{maxWidth:640,margin:"80px auto",padding:24}}><h1>Purchase tool</h1><p>{error || "Preparing your cart…"}</p><Link href="/">Back to tools</Link></main>;
}
