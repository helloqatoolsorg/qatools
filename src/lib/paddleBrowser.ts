"use client";

export type CheckoutEvent = { name?: string; data?: {
  transaction_id?: string; currency_code?: string;
  totals?: { total?: number; subtotal?: number; tax?: number; discount?: number; credit?: number };
  customer?: { business?: { id?: string; tax_identifier?: string } | null };
  items?: { price_id?: string; quantity?: number }[];
} };
type Paddle = {
  Environment: { set: (environment: "sandbox") => void };
  Initialize: (options: { token: string; pwCustomer?: Record<string, never>; eventCallback: (event: CheckoutEvent) => void }) => void;
  Checkout: { open: (options: { transactionId: string; settings: Record<string, unknown> }) => void; close: () => void };
};
declare global { interface Window { Paddle?: Paddle } }
let loading: Promise<Paddle> | null = null;
let initializedToken: string | null = null;
let initializedEnvironment: "sandbox" | "live" | null = null;
const listeners = new Set<(event: CheckoutEvent) => void>();

export function subscribeCheckout(listener: (event: CheckoutEvent) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export type ExpectedCheckout = { total: number; items: { priceId: string; slug: string }[]; allowBusinessTaxAdjustment?: boolean };
export function checkoutMatchesExpectedPrice(event: CheckoutEvent, transactionId: string, expected?: ExpectedCheckout) {
  const data = event.data;
  const target: ExpectedCheckout = expected ?? { total: 5, items: [{ priceId: "pri_01m41bkp4f0fxgb9cfm37n5p4b", slug: "qafit01" }] };
  const business = data?.customer?.business;
  // Browser checks only keep the provider window open; signed server confirmation grants ownership.
  const adjusted = target.allowBusinessTaxAdjustment === true && typeof data?.totals?.total === "number" && Number.isFinite(data.totals.total) &&
    data.totals.total > 0 && data.totals.total < target.total && data.totals.tax === 0 && data.totals.subtotal === data.totals.total &&
    /^biz_[a-z0-9]{26}$/.test(business?.id ?? "") && typeof business?.tax_identifier === "string" && business.tax_identifier.trim().length > 0;
  return data?.transaction_id === transactionId && data.currency_code === "EUR" &&
    (data.totals?.total === target.total || adjusted) && data.totals?.discount === 0 && data.totals.credit === 0 &&
    data.items?.length === target.items.length && target.items.every(item =>
      data.items?.filter(i => i.price_id === item.priceId && i.quantity === 1).length === 1);
}

export function loadSandboxPaddle(token: string): Promise<Paddle> { return loadPaddle(token, "sandbox"); }
export async function loadPaddle(token: string, environment: "sandbox" | "live"): Promise<Paddle> {
  const valid = environment === "sandbox" ? /^test_[A-Za-z0-9_-]+$/.test(token) : environment === "live" && /^live_[A-Za-z0-9_-]+$/.test(token);
  if (!valid || token.length > 512) throw new Error("Checkout unavailable.");
  if (!loading) loading = new Promise<Paddle>((resolve, reject) => {
    if (window.Paddle) { resolve(window.Paddle); return; }
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;
    const timer = window.setTimeout(() => { script.remove(); reject(new Error("Checkout took too long to load. Please try again.")); }, 15000);
    script.onload = () => {
      window.clearTimeout(timer);
      if (window.Paddle) resolve(window.Paddle); else reject(new Error("Checkout could not load."));
    };
    script.onerror = () => { window.clearTimeout(timer); script.remove(); reject(new Error("Checkout could not load. Check your connection.")); };
    document.head.appendChild(script);
  }).catch(reason => { loading = null; throw reason; });
  const paddle = await loading;
  if (!initializedToken) {
    if (environment === "sandbox") paddle.Environment.set("sandbox");
    paddle.Initialize({ token, ...(environment === "live" ? { pwCustomer: {} } : {}), eventCallback: event => { for (const listener of listeners) listener(event); } });
    initializedToken = token; initializedEnvironment = environment;
  } else if (initializedToken !== token || initializedEnvironment !== environment) throw new Error("Please reload the page before checking out.");
  return paddle;
}
