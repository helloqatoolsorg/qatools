"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useQAToolsState } from "@/context/QAToolsState";
import type { CartProduct } from "@/hooks/useCartProducts";
import { supabase } from "@/lib/supabase";
import { checkoutMatchesExpectedPrice, loadPaddle, subscribeCheckout, type ExpectedCheckout } from "@/lib/paddleBrowser";

export default function SandboxCheckout({ products, disabled }: { products: CartProduct[]; disabled: boolean }) {
  const { user } = useAuth();
  return <CheckoutSession key={user?.id ?? "anonymous"} products={products} disabled={disabled} />;
}

function CheckoutSession({ products, disabled }: { products: CartProduct[]; disabled: boolean }) {
  const { user } = useAuth();
  const userId = user?.id;
  const { refreshPurchases, purchasedItems } = useQAToolsState();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState<number[]>([]);
  const [paidSlugs, setPaidSlugs] = useState<string[]>([]);
  const [environment, setEnvironment] = useState<"sandbox" | "live">("sandbox");
  const transaction = useRef<string | null>(null);
  const busyRef = useRef(false);
  const owner = useRef<string | null>(null);
  const currentUser = useRef(user?.id);
  const paddle = useRef<Awaited<ReturnType<typeof loadPaddle>> | null>(null);
  const alive = useRef(true);
  const paidItems = products.filter(item => Number(item.price_eur) > 0);
  const expected = useRef<ExpectedCheckout | undefined>(undefined);
  const available = paidItems.length > 0 && paidItems.length <= 20 && paidItems.every(item => supported.includes(item.id));
  const confirmed = waiting && paidSlugs.length > 0 && paidSlugs.every(slug => purchasedItems.includes(slug));

  useEffect(() => {
    let canceled = false;
    alive.current = true;
    currentUser.current = userId;
    transaction.current = null; busyRef.current = false;
    if (!userId) return () => { alive.current = false; currentUser.current = undefined; };
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) return;
        const response = await fetch("/api/account/cart-checkout", {
          headers: { Authorization: "Bearer " + data.session.access_token }, cache: "no-store", signal: AbortSignal.timeout(10000),
        });
        const config = await response.json();
        if (!canceled && response.ok && config.enabled === true && ((config.environment === "sandbox" && /^test_[A-Za-z0-9_-]+$/.test(config.clientToken)) || (config.environment === "live" && /^live_[A-Za-z0-9_-]+$/.test(config.clientToken)))) { setEnvironment(config.environment); setToken(config.clientToken); setSupported(Array.isArray(config.productIds) ? config.productIds : []); }
      } catch { /* Availability fails closed; free-item acquisition remains available. */ }
    })();
    return () => { canceled = true; alive.current = false; currentUser.current = undefined; paddle.current?.Checkout.close(); };
  }, [userId]);

  useEffect(() => subscribeCheckout(event => {
    if (!transaction.current || owner.current !== currentUser.current) return;
    if (event.data?.transaction_id && event.data.transaction_id !== transaction.current) return;
    if (["checkout.loaded", "checkout.updated", "checkout.customer.updated", "checkout.items.updated"].includes(event.name ?? "")) {
      if (!checkoutMatchesExpectedPrice(event, transaction.current, expected.current)) {
        transaction.current = null;
        paddle.current?.Checkout.close();
        setBusy(false); busyRef.current = false;
        setError("Checkout price changed. Payment was closed. Please contact support before trying again.");
      }
    } else if (event.name === "checkout.completed" && event.data?.transaction_id === transaction.current) {
      // Browser completion starts a read-only ownership refresh; it never grants ownership.
      setMessage("Payment submitted. Confirming your items...");
      setWaiting(true); refreshPurchases();
    } else if (event.name === "checkout.closed") {
      setBusy(false); busyRef.current = false;
    } else if (event.name === "checkout.error" || event.name === "checkout.payment.failed") {
      setError("Payment could not be completed. Check the payment window for details.");
    }
  }), [refreshPurchases]);

  useEffect(() => {
    if (!waiting || confirmed) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      if (++attempts >= 30) {
        window.clearInterval(timer); setWaiting(false); setBusy(false); busyRef.current = false;
        setMessage("Payment confirmation is taking longer than usual. Check Your items later; do not pay again.");
      } else refreshPurchases();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [waiting, confirmed, refreshPurchases]);

  async function checkout() {
    if (busyRef.current || waiting || disabled || !available || !token || !user) return;
    busyRef.current = true; setBusy(true); setError(null); setMessage(null);
    const accountId = user.id;
    try {
      paddle.current = await loadPaddle(token, environment);
      if (!alive.current || currentUser.current !== accountId) return;
      const { data } = await supabase.auth.getSession();
      if (!data.session || data.session.user.id !== accountId) throw new Error("Please log in again before checking out.");
      if (!alive.current || currentUser.current !== accountId) return;
      const response = await fetch("/api/account/cart-checkout", {
        method: "POST", cache: "no-store", headers: { "Content-Type": "application/json", Authorization: "Bearer " + data.session.access_token },
        body: JSON.stringify({ productIds: paidItems.map(item => item.id), expectedEnvironment: environment }), signal: AbortSignal.timeout(30000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Checkout unavailable.");
      if (!alive.current || currentUser.current !== accountId) return;
      if ((environment === "live" || result.environment !== undefined) && result.environment !== environment) throw new Error("Checkout environment changed. Reload before paying.");
      if (!/^txn_[a-z0-9]{26}$/.test(result.transactionId)) throw new Error("Checkout could not be verified.");
      if (!result.expected || !Number.isFinite(result.expected.total) || result.expected.total !== paidItems.reduce((sum,item) => sum + Math.round(Number(item.price_eur) * 100),0) / 100 ||
          !Array.isArray(result.expected.items) || result.expected.items.length !== paidItems.length ||
          !paidItems.every(item => result.expected.items.filter((line: { slug?: string; priceId?: string }) => line.slug === item.slug && /^pri_[a-z0-9]{26}$/.test(line.priceId ?? "")).length === 1)) throw new Error("Checkout no longer matches your cart. Refresh before paying.");
      expected.current = { ...result.expected, allowBusinessTaxAdjustment: true };
      setPaidSlugs(result.expected.items.map((line: { slug: string }) => line.slug));
      owner.current = accountId; transaction.current = result.transactionId;
      paddle.current.Checkout.open({ transactionId: result.transactionId, settings: {
        displayMode: "overlay", theme: "dark", locale: "en", showAddDiscounts: false, showAddTaxId: true,
      } });
    } catch (reason) {
      if (!alive.current || currentUser.current !== accountId) return;
      setError(reason instanceof Error ? reason.message : "Checkout unavailable.");
      setBusy(false); busyRef.current = false;
    }
  }

  return <>
    {paidItems.length > 0 && <>
      <button className="cart-page-checkout" type="button" onClick={checkout} disabled={disabled || busy || waiting || !token || !available}>
        {waiting ? "CONFIRMING PAYMENT..." : busy ? "CHECKOUT OPEN..." : "CHECKOUT"}
      </button>
      <p style={{ color: "#777", font: "10px monospace" }}>{!user ? <>Please <a href="/user">log in</a> to checkout.</> : !token ? "Paid checkout is not available yet." : !available ? "A paid item is not ready for checkout yet. Remove unavailable items or contact support." : (environment === "sandbox" ? "Sandbox checkout — test payments only. Prices include tax; business tax is calculated at checkout." : "Prices include tax; business tax is calculated at checkout.")}</p>
    </>}
    {error && <p role="alert" style={{ color: "#e86565", font: "10px monospace" }}>{error}</p>}
    {(message || confirmed) && <p role="status" style={{ color: "#55b86d", font: "10px monospace" }}>{confirmed ? "Your purchased items are now in your account. Refresh your Houdini license to include them." : message} <a href="/user?section=purchased">Your items</a></p>}
  </>;
}
