"use client";
import SiteFooter from "@/components/SiteFooter";
import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";
import OutlineIcon from "@/components/OutlineIcon";
import type { AccountOrder, AccountPurchases } from "@/lib/accountPurchases";
import AccountProductList, { accountDate } from "@/components/AccountProductList";
import "./dashboard.css";

import {
  FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";

import { useAuth } from "@/context/AuthContext";
import { useQAToolsState } from "@/context/QAToolsState";
import { supabase } from "@/lib/supabase";
import PasswordForm from "@/components/PasswordForm";
import AccountActivationKey from "@/components/AccountActivationKey";

type AuthMode =
  | "login"
  | "signup"
  | "reset";

export default function UserPage() {
  const [purchaseRevision, setPurchaseRevision] = useState(0);
  const {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    sendPasswordReset,
  } = useAuth();
  useEffect(() => {
    if (!user) return;
    const slug = new URLSearchParams(window.location.search).get("purchase");
    if (slug && /^[a-z0-9][a-z0-9_-]{0,127}$/.test(slug)) window.location.replace("/purchase?tool=" + encodeURIComponent(slug));
  }, [user]);

  const {
    likedCount,
    cartCount,
  } = useQAToolsState();

  const [
    authMode,
    setAuthMode,
  ] =
    useState<AuthMode>(
      "login"
    );

  const [snapshot, setSnapshot] = useState<{
    userId: string;
    account: AccountPurchases;
    orders: AccountOrder[];
    orderError: string | null;
  } | null>(null);
  const [productsLoading, setProductsLoading] = useState(true);
  const [readyKeyOwner, setReadyKeyOwner] = useState<string | null>(null);
  const [licenseDetailsOpen, setLicenseDetailsOpen] = useState(false);
  const userId = user?.id;
  const [passwordFormOwner, setPasswordFormOwner] = useState<string | null>(null);
  const passwordFormOpen = userId !== undefined && passwordFormOwner === userId;
  const onLicenseKeyReady = useCallback(() => setReadyKeyOwner(userId ?? null), [userId]);
  const [productsError, setProductsError] = useState<{ userId: string; message: string } | null>(null);
  const refreshProducts = useCallback(() => setPurchaseRevision(revision => revision + 1), []);
  const dashboard = snapshot?.userId === user?.id ? snapshot : null;
  const account = dashboard?.account ?? null;
  const machine = account?.machines.find(item => item.status === "active");

  const [
    email,
    setEmail,
  ] = useState("");

  const [
    password,
    setPassword,
  ] = useState("");

  const [
    busy,
    setBusy,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] =
    useState<string | null>(
      null
    );

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null
    );

  /*
    --------------------------------------------------
    URL STATE
    --------------------------------------------------
  */
  useEffect(() => {
    const params =
      new URLSearchParams(
        window.location.search
      );

    const mode =
      params.get("mode");

    if (
      mode === "signup"
    ) {
      setAuthMode(
        "signup"
      );
    } else if (
      mode === "reset"
    ) {
      setAuthMode(
        "reset"
      );
    } else {
      setAuthMode(
        "login"
      );
    }

  }, []);

  /*
    --------------------------------------------------
    REAL AUTH EMAIL
    --------------------------------------------------
  */
  useEffect(() => {
    if (
      user?.email
    ) {
      setEmail(
        user.email
      );
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const userId = user.id;
    const controller = new AbortController();

    async function loadProducts() {
      setProductsLoading(true);
      setProductsError(null);
      try {
        const { data, error } = await supabase.auth.getSession();
        if (controller.signal.aborted) return;
        if (error || !data.session || data.session.user.id !== userId) throw new Error("Please log in again.");
        const [response, orderResult] = await Promise.all([
          fetch("/api/account/purchases", {
            cache: "no-store",
            signal: controller.signal,
            headers: { Authorization: "Bearer " + data.session.access_token },
          }),
          supabase.from("orders").select(`
            id, order_number, provider, provider_transaction_id, status, currency,
            total, provider_created_at, created_at,
            order_items (product_id, products (id, name, slug, price_eur, published,
              current_version, product_type, category (name)))
          `).eq("user_id", userId).order("created_at", { ascending: false }).abortSignal(controller.signal),
        ]);
        const account = await response.json() as AccountPurchases & { error?: string };
        if (controller.signal.aborted) return;
        if (!response.ok || !account.ok) throw new Error(account.error ?? "Unable to load account products.");
        setSnapshot(current => ({
          userId,
          account,
          orders: orderResult.error ? (current?.userId === userId ? current.orders : []) : orderResult.data,
          orderError: orderResult.error ? "Unable to load orders and receipts. Please refresh." : null,
        }));
      } catch (reason) {
        if (!controller.signal.aborted) {
          setProductsError({ userId, message: reason instanceof Error ? reason.message : "Unable to load account products." });
        }
      } finally {
        if (!controller.signal.aborted) setProductsLoading(false);
      }
    }
    void loadProducts();
    return () => controller.abort();
  }, [user, purchaseRevision]);

  useEffect(() => {
    if (!user || loading) return;
    const params = new URLSearchParams(window.location.search);
    const section = params.get("section");
    if (section === "license" && params.get("highlight") === "key") return;
    const target = section === "license" ? "account-license"
      : section === "purchased" || section === "orders" ? "account-products"
      : null;
    const element = target ? document.getElementById(target) : null;
    element?.scrollIntoView({ behavior: "instant" });
  }, [user, loading]);

  useEffect(() => {
    if (!userId || loading || productsLoading || readyKeyOwner !== userId) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("section") !== "license" || params.get("highlight") !== "key") return;
    const section = document.getElementById("account-license");
    if (!section || section.classList.contains("account-license-highlight")) return;

    let frame = 0;
    function afterPageLoad() {
      frame = window.requestAnimationFrame(() => {
        section?.scrollIntoView({ behavior: "instant" });
        section?.classList.add("account-license-highlight");
      });
    }
    if (document.readyState === "complete") afterPageLoad();
    else window.addEventListener("load", afterPageLoad, { once: true });
    return () => {
      window.removeEventListener("load", afterPageLoad);
      window.cancelAnimationFrame(frame);
    };
  }, [userId, loading, productsLoading, readyKeyOwner]);

  function changeMode(
    mode: AuthMode
  ) {
    setAuthMode(mode);

    setError(null);
    setMessage(null);

    const url =
      mode === "login"
        ? "/user"
        : `/user?mode=${mode}`;

    window.history.replaceState(
      {},
      "",
      url
    );
  }

  /*
    --------------------------------------------------
    AUTH ACTIONS
    --------------------------------------------------
  */
  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setBusy(true);
    setMessage(null);
    setError(null);

    if (
      authMode ===
      "login"
    ) {
      const result =
        await signIn(
          email.trim(),
          password
        );

      if (
        result.error
      ) {
        setError(
          result.error
        );
      }

      setBusy(false);
      return;
    }

    if (
      authMode ===
      "signup"
    ) {
      if (
        password.length < 6
      ) {
        setError(
          "Password must contain at least 6 characters."
        );

        setBusy(false);
        return;
      }

      const result =
        await signUp(
          email.trim(),
          password
        );

      if (
        result.error
      ) {
        setError(
          result.error
        );

        setBusy(false);
        return;
      }

      if (
        result.needsEmailConfirmation
      ) {
        setMessage(
          "Account created. Check your email to confirm your account."
        );
      } else {
        setMessage(
          "Account created."
        );
      }

      setBusy(false);
      return;
    }

    const result =
      await sendPasswordReset(
        email.trim()
      );

    if (
      result.error
    ) {
      if (
        result.error
          .toLowerCase()
          .includes(
            "rate limit"
          )
      ) {
        setError(
          "Too many account emails have been requested. Please wait before trying again."
        );
      } else {
        setError(
          result.error
        );
      }
    } else {
      setMessage(
        "Password reset email sent."
      );
    }

    setBusy(false);
  }

  async function handleLogOut() {
    setBusy(true);

    setError(null);
    setMessage(null);

    const result =
      await signOut();

    if (
      result.error
    ) {
      setError(
        result.error
      );
    } else {
      setSnapshot(null);
      setProductsError(null);
      setProductsLoading(true);
      setReadyKeyOwner(null);
      setLicenseDetailsOpen(false);
      setPasswordFormOwner(null);
    }

    setBusy(false);
  }

  return (
    <div className="content-page">

      {/* ==================================================
          TOP SHELF
      ================================================== */}

      <header className="site-header">
        <Link
          className="brand"
          href="/"
        >
            <BrandLogo />
          </Link>

        <nav className="main-nav">
          <a href="/">
            products
          </a>

          <a href="/install">
            how to install
          </a>

          <a href="/whats-new">
            what&apos;s new
          </a>
        </nav>

        <nav className="icon-nav">
          <a
            className={`icon-link liked-nav-link ${
              likedCount > 0
                ? "has-likes"
                : ""
            }`}
            href="/liked"
            aria-label="Liked products"
            title="Liked products"
          >
            <span className="liked-icon">
              <OutlineIcon kind="heart" />
            </span>

            <span className="liked-count">
              {likedCount > 0
                ? likedCount
                : ""}
            </span>
          </a>

          <a
            className="icon-link active-account"
            href="/user"
            aria-label="Account"
            title="Account"
          >
            <OutlineIcon kind="account" />
          </a>

          <button
            id="cartButton"
            className={
              cartCount > 0
                ? "cart-has-items"
                : ""
            }
            aria-label="Cart"
            title="Cart"
            type="button"
          >
            <OutlineIcon kind="cart" />

            <span className="cart-count">
              {cartCount > 0
                ? cartCount
                : ""}
            </span>
          </button>
        </nav>
      </header>

      {loading ? (
        <main
          style={{
            padding:
              "50px 26px",

            color:
              "#666",

            fontFamily:
              "monospace",
          }}
        >
          loading account...
        </main>
      ) : user ? (

        /* ==================================================
           LOGGED-IN USER AREA
        ================================================== */

        <main className="account-dashboard">
          <div>
            <span className="eyebrow">Dashboard</span>
            <div className="account-dashboard-heading">
              <h1>{user.email}</h1>
              <div className="account-dashboard-actions">
                <button type="button" className="account-action" aria-expanded={passwordFormOpen}
                  aria-controls="account-password" onClick={() => setPasswordFormOwner(passwordFormOpen ? null : user.id)}>
                  Change password
                </button>
                <button type="button" className="account-action" disabled={busy} onClick={handleLogOut}>Log out</button>
              </div>
            </div>
            <div id="account-password" hidden={!passwordFormOpen}>
              {passwordFormOpen && <PasswordForm key={user.id} />}
            </div>
          </div>

          <section className="account-dashboard-license" id="account-license" aria-labelledby="account-license-title">
            <h2 id="account-license-title">License key</h2>
            <div className="account-license-row account-expandable-row">
              <button type="button" className="account-row-toggle"
                aria-label="License details" aria-expanded={licenseDetailsOpen} aria-controls="account-license-details"
                onClick={() => setLicenseDetailsOpen(open => !open)}>
                <span className="account-row-toggle-label">Details</span>
                <span className="account-row-toggle-chevron" aria-hidden="true" />
              </button>
              <AccountActivationKey key={user.id} embedded onReady={onLicenseKeyReady} />
            </div>
            <div id="account-license-details" hidden={!licenseDetailsOpen}>
              <dl className="account-detail-grid">
                <div><dt>Active machine</dt><dd>{productsLoading && !account ? "Loading..." : machine?.machine_id ?? (account ? "Not activated" : "Unavailable")}</dd></div>
                <div><dt>Activation date</dt><dd>{accountDate(machine?.activated_at)}</dd></div>
                <div><dt>Purchased tools</dt><dd>{account?.entitlements.filter(entry =>
                  entry.status === "active" && ["purchase", "bundle"].includes(entry.source) && entry.products?.product_type === "tool"
                ).length ?? "Unavailable"}</dd></div>
              </dl>
            </div>
          </section>

          <AccountProductList key={user.id} account={account} orders={dashboard?.orders ?? []}
            loading={productsLoading} error={(productsError?.userId === user.id ? productsError.message : null) ?? dashboard?.orderError ?? null}
            refresh={refreshProducts} />

          {error && <p className="password-error" role="alert">{error}</p>}
        </main>
      ) : (

        /* ==================================================
           LOGGED-OUT ACCOUNT PAGE
        ================================================== */

        <main className="standalone-page">
          {authMode !== "login" && (
            <>
              <h1>{authMode === "signup" ? "Create your QATools account." : "Reset your password."}</h1>
              <p>
                {authMode === "signup"
                  ? "Create one account for purchases, downloads and tool activation."
                  : "Enter your email and we will send you a password reset link."}
              </p>
            </>
          )}

          <form
            aria-label={authMode === "login" ? "Log in" : undefined}
            onSubmit={
              handleSubmit
            }
            style={{
              maxWidth:
                "470px",

              marginTop:
                authMode === "login" ? 0 : "48px",

              display:
                "grid",

              gap:
                "18px",
            }}
          >
            <label
              style={{
                display:
                  "grid",

                gap:
                  "8px",

                color:
                  "#666",

                font:
                  "9px monospace",
              }}
            >
              EMAIL

              <input
                type="email"
                required
                autoComplete="email"
                value={
                  email
                }
                onChange={(
                  event
                ) =>
                  setEmail(
                    event.target
                      .value
                  )
                }
                style={{
                  height:
                    "42px",

                  border:
                    "1px solid #2a2a2a",

                  background:
                    "#111",

                  color:
                    "#ccc",

                  padding:
                    "0 12px",

                  outline:
                    "none",

                  font:
                    "10px monospace",
                }}
              />
            </label>

            {authMode !==
              "reset" && (
              <label
                style={{
                  display:
                    "grid",

                  gap:
                    "8px",

                  color:
                    "#666",

                  font:
                    "9px monospace",
                }}
              >
                PASSWORD

                <input
                  type="password"
                  required
                  autoComplete={
                    authMode ===
                    "signup"
                      ? "new-password"
                      : "current-password"
                  }
                  value={
                    password
                  }
                  onChange={(
                    event
                  ) =>
                    setPassword(
                      event.target
                        .value
                    )
                  }
                  style={{
                    height:
                      "42px",

                    border:
                      "1px solid #2a2a2a",

                    background:
                      "#111",

                    color:
                      "#ccc",

                    padding:
                      "0 12px",

                    outline:
                      "none",

                    font:
                      "10px monospace",
                  }}
                />
              </label>
            )}

            <button
              type="submit"
              disabled={
                busy
              }
              style={{
                height:
                  "44px",

                marginTop:
                  "6px",

                border:
                  "1px solid #ededeb",

                background:
                  "#ededeb",

                color:
                  "#0d0d0d",

                cursor:
                  busy
                    ? "default"
                    : "pointer",

                opacity:
                  busy
                    ? 0.5
                    : 1,

                font:
                  "500 10px monospace",
              }}
            >
              {busy
                ? "PLEASE WAIT..."
                : authMode ===
                    "login"
                  ? "LOG IN"
                  : authMode ===
                      "signup"
                    ? "SIGN UP"
                    : "SEND RESET LINK"}
            </button>
          </form>

          {message && (
            <p
              style={{
                maxWidth:
                  "470px",

                marginTop:
                  "22px",

                color:
                  "#7f9d7f",

                font:
                  "10px monospace",

                lineHeight:
                  1.6,
              }}
            >
              {message}
            </p>
          )}

          {error && (
            <p
              style={{
                maxWidth:
                  "470px",

                marginTop:
                  "22px",

                color:
                  "#e86565",

                font:
                  "10px monospace",

                lineHeight:
                  1.6,
              }}
            >
              {error}
            </p>
          )}

          <div
            style={{
              maxWidth:
                "470px",

              marginTop:
                "30px",

              paddingTop:
                "20px",

              borderTop:
                "1px solid #1c1c1c",

              display:
                "flex",

              flexWrap:
                "wrap",

              gap:
                "18px",
            }}
          >
            {authMode !==
              "login" && (
              <button
                type="button"
                onClick={() =>
                  changeMode(
                    "login"
                  )
                }
                style={{
                  border: 0,
                  padding: 0,
                  background:
                    "transparent",
                  color:
                    "#777",
                  cursor:
                    "pointer",
                  font:
                    "12px monospace",
                }}
              >
                LOG IN
              </button>
            )}

            {authMode !==
              "signup" && (
              <button
                type="button"
                onClick={() =>
                  changeMode(
                    "signup"
                  )
                }
                style={{
                  border: 0,
                  padding: 0,
                  background:
                    "transparent",
                  color:
                    "#777",
                  cursor:
                    "pointer",
                  font:
                    "12px monospace",
                }}
              >
                SIGN UP
              </button>
            )}

            {authMode !==
              "reset" && (
              <button
                type="button"
                onClick={() =>
                  changeMode(
                    "reset"
                  )
                }
                style={{
                  border: 0,
                  padding: 0,
                  background:
                    "transparent",
                  color:
                    "#777",
                  cursor:
                    "pointer",
                  font:
                    "12px monospace",
                }}
              >
                FORGOT PASSWORD
              </button>
            )}
          </div>
        </main>
      )}

      <SiteFooter>account</SiteFooter>
    </div>
  );
}
