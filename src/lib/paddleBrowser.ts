"use client";

export type CheckoutEvent = { name?: string; data?: {
  transaction_id?: string; currency_code?: string;
  totals?: { total?: number; discount?: number; credit?: number };
  items?: { price_id?: string; quantity?: number }[];
} };
type Paddle = {
  Environment: { set: (environment: "sandbox") => void };
  Initialize: (options: { token: string; eventCallback: (event: CheckoutEvent) => void }) => void;
  Checkout: { open: (options: { transactionId: string; settings: Record<string, unknown> }) => void; close: () => void };
};
declare global { interface Window { Paddle?: Paddle } }
let loading: Promise<Paddle> | null = null;
let initializedToken: string | null = null;
const listeners = new Set<(event: CheckoutEvent) => void>();

export function subscribeCheckout(listener: (event: CheckoutEvent) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function checkoutMatchesExpectedPrice(event: CheckoutEvent, transactionId: string) {
  const data = event.data;
  return data?.transaction_id === transactionId && data.currency_code === "EUR" &&
    data.totals?.total === 5 && data.totals.discount === 0 && data.totals.credit === 0 &&
    data.items?.length === 1 && data.items[0].price_id === "pri_01m41bkp4f0fxgb9cfm37n5p4b" && data.items[0].quantity === 1;
}

export async function loadSandboxPaddle(token: string): Promise<Paddle> {
  if (!/^test_[A-Za-z0-9_-]+$/.test(token)) throw new Error("Sandbox checkout unavailable.");
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
    paddle.Environment.set("sandbox");
    paddle.Initialize({ token, eventCallback: event => { for (const listener of listeners) listener(event); } });
    initializedToken = token;
  } else if (initializedToken !== token) throw new Error("Please reload the page before checking out.");
  return paddle;
}
