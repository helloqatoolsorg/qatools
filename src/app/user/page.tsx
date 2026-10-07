"use client";
import type { AccountAccess, AccountPurchases } from "@/lib/accountPurchases";
import AccountName from "@/components/AccountName";
import { formatOrderNumber } from "@/lib/orderNumber";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";

import { useAuth } from "@/context/AuthContext";
import { useQAToolsState } from "@/context/QAToolsState";
import { supabase } from "@/lib/supabase";
import PasswordForm from "@/components/PasswordForm";
import AccountActivationKey from "@/components/AccountActivationKey";
import ProductDownload from "@/components/ProductDownload";
import OrderInvoice from "@/components/OrderInvoice";

type AuthMode =
  | "login"
  | "signup"
  | "reset";

type UserSection =
  | "overview"
  | "purchased"
  | "license"
  | "orders"
  | "payment"
  | "general";

type ProfileRow = {
  name: string | null;
  invoice_details: string | null;
};

type LicenseActivation = {
  id: number;
  machine_id: string;
  status: string;
  activated_at: string;
};

type Entitlement = AccountAccess;

type OrderProduct = {
  id: number;
  name: string;
  slug: string;
};

type OrderItem = {
  id: number;
  quantity: number;
  unit_price: number | string;

  products:
    | OrderProduct
    | null;
};

type Order = {
  id: number;
  order_number: string | null;
  provider: string;
  provider_order_id: string | null;
  provider_transaction_id: string | null;
  status: string;
  currency: string;
  subtotal: number | string;
  total: number | string;
  provider_created_at: string | null;
  created_at: string;

  order_items: OrderItem[];
};

function formatDate(
  value: string | null
) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }
  ).format(date);
}

function formatMoney(
  value: number | string,
  currency: string
) {
  const amount =
    Number(value);

  if (
    Number.isNaN(amount)
  ) {
    return "—";
  }

  try {
    return new Intl.NumberFormat(
      "en-IE",
      {
        style: "currency",
        currency:
          currency || "EUR",
      }
    ).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${
      currency || "EUR"
    }`;
  }
}

export default function UserPage() {
  const [purchaseRevision,setPurchaseRevision]=useState(0);
  const {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    sendPasswordReset,
  } = useAuth();

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

  const [
    activeSection,
    setActiveSection,
  ] =
    useState<UserSection>(
      "overview"
    );

  const [
    openEntitlement,
    setOpenEntitlement,
  ] =
    useState<number | null>(
      null
    );

  const [accountActivations, setAccountActivations] = useState<LicenseActivation[]>([]);

  const [
    entitlements,
    setEntitlements,
  ] =
    useState<Entitlement[]>(
      []
    );

  const [
    entitlementsLoading,
    setEntitlementsLoading,
  ] = useState(false);

  const [
    orders,
    setOrders,
  ] =
    useState<Order[]>([]);

  const [
    ordersLoading,
    setOrdersLoading,
  ] = useState(false);

  const [
    ordersError,
    setOrdersError,
  ] =
    useState<string | null>(
      null
    );

  const [
    email,
    setEmail,
  ] = useState("");

  const [
    password,
    setPassword,
  ] = useState("");

  const [
    profileName,
    setProfileName,
  ] = useState("");

  const [
    invoiceDetails,
    setInvoiceDetails,
  ] = useState("");

  const [
    profileLoading,
    setProfileLoading,
  ] = useState(false);

  const [
    profileSaving,
    setProfileSaving,
  ] = useState(false);

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

    const section =
      params.get("section");

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

    if (
      section === "overview" ||
      section === "purchased" ||
      section === "license" ||
      section === "orders" ||
      section === "payment" ||
      section === "general"
    ) {
      setActiveSection(
        section
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

  /*
    --------------------------------------------------
    REAL PROFILE
    --------------------------------------------------
  */
  useEffect(() => {
    if (!user) {
      setProfileName("");
      setInvoiceDetails("");
      return;
    }

    const userId = user.id;

    let cancelled =
      false;

    async function loadProfile() {
      setProfileLoading(
        true
      );

      setError(null);

      const {
        data,
        error: profileError,
      } =
        await supabase
          .from("profiles")
          .select(
            "name, invoice_details"
          )
          .eq(
            "user_id",
            userId
          )
          .maybeSingle();

      if (cancelled) {
        return;
      }

      if (
        profileError
      ) {
        setError(
          profileError.message
        );

        setProfileLoading(
          false
        );

        return;
      }

      const profile =
        data as ProfileRow | null;

      setProfileName(
        profile?.name ??
          ""
      );

      setInvoiceDetails(
        profile?.invoice_details ??
          ""
      );

      setProfileLoading(
        false
      );
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [user]);

  /*
    --------------------------------------------------
    REAL PURCHASED PRODUCTS / ENTITLEMENTS
    --------------------------------------------------

    This reads only the currently logged-in user's
    entitlement rows.

    The authenticated server route reads this account's access and origins.
  */
  useEffect(() => {
    if (!user) {
      setEntitlements([]);
      setAccountActivations([]);
      return;
    }


    let cancelled =
      false;

    async function loadEntitlements() {
      setEntitlements([]);
      setAccountActivations([]);
      setEntitlementsLoading(
        true
      );

      setError(null);

      try {
        const session=await supabase.auth.getSession();
        if(session.error || !session.data.session)throw Error("Please log in again.");
        const response=await fetch("/api/account/purchases",{cache:"no-store",headers:{Authorization:"Bearer "+session.data.session.access_token}});
        const body=await response.json() as AccountPurchases & {error?:string};
        if(!response.ok || !body.ok)throw Error(body.error ?? "Unable to load purchases and account machine.");
        if(cancelled)return;
        setEntitlements(body.entitlements);setAccountActivations(body.machines);setEntitlementsLoading(false);
      }catch(reason){if(!cancelled){setError(reason instanceof Error?reason.message:"Unable to load purchases and account machine.");setEntitlementsLoading(false);}}
    }

    loadEntitlements();

    return () => {
      cancelled = true;
    };
  }, [user,purchaseRevision]);

  /*
    --------------------------------------------------
    REAL ORDERS & ORDER ITEMS
    --------------------------------------------------

    The browser can read only the logged-in user's
    orders. RLS is the security boundary.

    Orders are created later by trusted checkout /
    webhook logic, never by the customer browser.
  */
  useEffect(() => {
    if (!user) {
      setOrders([]);
      setOrdersError(null);
      return;
    }

    const userId = user.id;

    let cancelled =
      false;

    async function loadOrders() {
      setOrdersLoading(
        true
      );

      setOrdersError(null);

      const {
        data,
        error: ordersQueryError,
      } =
        await supabase
          .from("orders")
          .select(`
            id,
            order_number,
            provider,
            provider_order_id,
            provider_transaction_id,
            status,
            currency,
            subtotal,
            total,
            provider_created_at,
            created_at,

            order_items (
              id,
              quantity,
              unit_price,

              products (
                id,
                name,
                slug
              )
            )
          `)
          .eq(
            "user_id",
            userId
          )
          .order(
            "created_at",
            {
              ascending:
                false,
            }
          );

      if (cancelled) {
        return;
      }

      if (
        ordersQueryError
      ) {
        setOrdersError(
          ordersQueryError.message
        );

        setOrdersLoading(
          false
        );

        return;
      }

      setOrders(
        data ?? []
      );

      setOrdersLoading(
        false
      );
    }

    loadOrders();

    return () => {
      cancelled = true;
    };
  }, [user]);

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

  function changeSection(
    section: UserSection
  ) {
    setActiveSection(
      section
    );

    setMessage(null);
    setError(null);

    window.history.replaceState(
      {},
      "",
      `/user?section=${section}`
    );
  }

  function toggleEntitlement(
    entitlementId: number
  ) {
    setOpenEntitlement(
      (current) =>
        current ===
        entitlementId
          ? null
          : entitlementId
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
    }

    setBusy(false);
  }

  /*
    --------------------------------------------------
    SAVE REAL PROFILE
    --------------------------------------------------
  */
  async function handleSaveProfile(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!user) {
      return;
    }

    setProfileSaving(
      true
    );

    setMessage(null);
    setError(null);

    const cleanName =
      profileName.trim();

    const cleanInvoiceDetails =
      invoiceDetails.trim();

    const {
      data,
      error: updateError,
    } =
      await supabase
        .from("profiles")
        .update({
          name:
            cleanName ||
            null,

          invoice_details:
            cleanInvoiceDetails ||
            null,
        })
        .eq(
          "user_id",
          user.id
        )
        .select(
          "name, invoice_details"
        )
        .single();

    if (
      updateError
    ) {
      setError(
        updateError.message
      );

      setProfileSaving(
        false
      );

      return;
    }

    const savedProfile =
      data as ProfileRow;
    window.dispatchEvent(new Event("qatools-profile-updated"));

    setProfileName(
      savedProfile.name ??
        ""
    );

    setInvoiceDetails(
      savedProfile.invoice_details ??
        ""
    );

    setMessage(
      "Profile saved."
    );

    setProfileSaving(
      false
    );
  }

  return (
    <div className="content-page">

      {/* ==================================================
          TOP SHELF
      ================================================== */}

      <header className="site-header">
        <a
          className="brand"
          href="/"
        >
          <img
            src="/assets/qatools_logo.png"
            alt="qatools"
          />
        </a>

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
          <AccountName />
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
              {likedCount > 0
                ? "♥"
                : "♡"}
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
            ○
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
            □

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

        <main className="user-page">

          {/* ================================================
              USER SIDEBAR
          ================================================ */}

          <aside className="user-sidebar">
            <button type="button" className="user-title overview-link" onClick={() => changeSection("overview")}>MY qatools</button>

            <nav>
              <button
                className={`user-nav ${
                  activeSection ===
                  "purchased"
                    ? "active"
                    : ""
                }`}
                type="button"
                onClick={() =>
                  changeSection(
                    "purchased"
                  )
                }
              >
                ✓ Purchased Products
              </button>

              <button
                className={`user-nav ${
                  activeSection ===
                  "license"
                    ? "active"
                    : ""
                }`}
                type="button"
                onClick={() =>
                  changeSection(
                    "license"
                  )
                }
              >
                License Data
              </button>

              <button
                className={`user-nav ${
                  activeSection ===
                  "orders"
                    ? "active"
                    : ""
                }`}
                type="button"
                onClick={() =>
                  changeSection(
                    "orders"
                  )
                }
              >
                Orders & Receipts
              </button>

              <button
                className={`user-nav ${
                  activeSection ===
                  "payment"
                    ? "active"
                    : ""
                }`}
                type="button"
                onClick={() =>
                  changeSection(
                    "payment"
                  )
                }
              >
                Payment Method
              </button>

              <button
                className={`user-nav ${
                  activeSection ===
                  "general"
                    ? "active"
                    : ""
                }`}
                type="button"
                onClick={() =>
                  changeSection(
                    "general"
                  )
                }
              >
                General / Personal Information
              </button>
            </nav>
            <button type="button" className="user-nav sidebar-logout" disabled={busy} onClick={handleLogOut}>Log out</button>
            {error && activeSection !== "general" && <p role="alert" className="user-muted">{error}</p>}
          </aside>

          <section className="user-content">
            {activeSection === "overview" && <section className="user-section active">
              <div className="user-section-head"><h1>Account overview</h1></div>
              <dl className="account-overview">
                <div><dt>User name</dt><dd>{profileLoading ? "Loading…" : profileName || "—"}</dd></div>
                <div><dt>Email</dt><dd>{user.email || "—"}</dd></div>
                <div><dt>Active machine</dt><dd>{entitlementsLoading ? "Loading…" : accountActivations.find(a => a.status === "active")?.machine_id || "Not activated"}</dd></div>
                <div><dt>Activation date</dt><dd>{entitlementsLoading ? "Loading…" : formatDate(accountActivations.find(a => a.status === "active")?.activated_at ?? null)}</dd></div>
                <div><dt>Purchased tools</dt><dd>{entitlementsLoading ? "Loading…" : entitlements.filter(e => e.status === "active" && ["purchase","bundle"].includes(e.source) && e.products?.product_type === "tool").length}</dd></div>
              </dl>
              <AccountActivationKey key={user.id} />
            </section>}

            {/* ==============================================
                REAL PURCHASED PRODUCTS
            ============================================== */}

            <section
              className={`user-section ${
                activeSection ===
                "purchased"
                  ? "active"
                  : ""
              }`}
            >
              <div className="user-section-head">
                <div>
                  <span className="eyebrow">
                    ACCOUNT
                  </span>

                  <h1>
                    Purchased Products
                  </h1>
                </div>

                <button type="button" className="menu-trigger" disabled={entitlementsLoading} onClick={()=>setPurchaseRevision(v=>v+1)}>Refresh purchases</button>
                <span className="muted-count">
                  {entitlementsLoading
                    ? "loading..."
                    : `${entitlements.filter(e=>e.direct_acquisition).length} ${
                        entitlements.filter(e=>e.direct_acquisition).length ===
                        1
                          ? "product"
                          : "products"
                      }`}
                </span>
              </div>

              {entitlementsLoading ? (
                <p className="user-muted">
                  loading purchased products...
                </p>
              ) : entitlements.filter(e=>e.direct_acquisition).length ===
                0 ? (
                <div
                  style={{
                    padding:
                      "60px 0",

                    borderBottom:
                      "1px solid #1c1c1c",
                  }}
                >
                  <span
                    style={{
                      color:
                        "#555",

                      font:
                        "9px monospace",

                      letterSpacing:
                        ".08em",
                    }}
                  >
                    NO PURCHASED PRODUCTS
                  </span>

                  <p className="user-muted">
                    Products you acquire
                    will appear here
                    automatically.
                  </p>

                  <a
                    href="/"
                    style={{
                      display:
                        "inline-block",

                      marginTop:
                        "10px",

                      border:
                        "1px solid #333",

                      padding:
                        "9px 11px",

                      color:
                        "#999",

                      font:
                        "8px monospace",
                    }}
                  >
                    BROWSE PRODUCTS
                  </a>
                </div>
              ) : (
                <div className="purchase-list">
                  {entitlements.filter(e=>e.direct_acquisition).map(
                    (
                      entitlement
                    ) => {
                      const product =
                        entitlement.products;

                      if (
                        !product
                      ) {
                        return null;
                      }

                      const activeActivation =
                        accountActivations.find(
                          (
                            activation
                          ) =>
                            activation.status ===
                            "active"
                        );

                      const isOpen =
                        openEntitlement ===
                        entitlement.id;

                      return (
                        <div
                          key={
                            entitlement.id
                          }
                        >
                          <button
                            className={`purchase-row ${
                              isOpen
                                ? "open"
                                : ""
                            }`}
                            type="button"
                            onClick={() =>
                              toggleEntitlement(
                                entitlement.id
                              )
                            }
                          >
                            <span className="owned-mark">
                              ✓
                            </span>

                            <strong>
                              {
                                product.name
                              }
                            </strong>

                            <span>
                              {product.category
                                ?.name ??
                                "—"}
                            </span>

                            <span>
                              {formatDate(
                                entitlement.granted_at
                              )}
                            </span>

                            <span>
                              {product.current_version ??
                                "—"}
                            </span>

                            <span className="status-ok">
                              {entitlement.status.toUpperCase()}
                            </span>

                            <span>
                              {isOpen
                                ? "⌃"
                                : "⌄"}
                            </span>
                          </button>

                          <div
                            className={`purchase-detail ${
                              isOpen
                                ? "open"
                                : ""
                            }`}
                          >
                            <div>
                              <span>
                                Product
                              </span>

                              <strong>
                                {
                                  product.name
                                }
                              </strong>
                            </div>

                            <div>
                              <span>
                                Ownership source
                              </span>

                              <strong>
                                {entitlement.source.toUpperCase()}
                              </strong>
                            </div>

                            <div>
                              <span>
                                Acquired
                              </span>

                              <strong>
                                {formatDate(
                                  entitlement.granted_at
                                )}
                              </strong>
                            </div>

                            <div>
                              <span>
                                Account machine
                              </span>

                              <strong>
                                {activeActivation
                                  ?.machine_id ??
                                  "NOT ACTIVATED"}
                              </strong>
                            </div>

                            <div>
                              <span>
                                License status
                              </span>

                              <strong>
                                {activeActivation
                                  ? activeActivation.status.toUpperCase()
                                  : "NOT ACTIVATED"}
                              </strong>
                            </div>

                            {entitlement.included_tools.length>0 && <div className="purchase-included-tools"><span>Included tools</span><div className="tags">{entitlement.included_tools.map(tool=><a key={tool.id} className="card-tag" href={"/product?id="+tool.slug}>{tool.name}</a>)}</div></div>}
                            <div className="purchase-actions">
                              {entitlement.status === "active" && <ProductDownload productId={product.id} />}
                              <a
                                href={`/product?id=${product.slug}`}
                              >
                                VIEW PRODUCT
                              </a>
                            </div>
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              )}

              {error &&
                activeSection ===
                  "purchased" && (
                  <p
                    style={{
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
            </section>

            {/* ==============================================
                REAL LICENSE DATA
            ============================================== */}

            <section
              className={`user-section ${
                activeSection ===
                "license"
                  ? "active"
                  : ""
              }`}
            >
              <div className="user-section-head">
                <div>
                  <span className="eyebrow">
                    ACCOUNT
                  </span>

                  <h1>
                    License Data
                  </h1>
                </div>

                <span className="muted-count">
                  {entitlementsLoading
                    ? "loading..."
                    : `${entitlements.length} ${
                        entitlements.length ===
                        1
                          ? "license"
                          : "licenses"
                      }`}
                </span>
              </div>

              {activeSection === "license" && user && <AccountActivationKey key={user.id} />}

              {entitlementsLoading ? (
                <p className="user-muted">
                  loading license data...
                </p>
              ) : entitlements.length ===
                0 ? (
                <div
                  style={{
                    padding:
                      "60px 0",

                    borderBottom:
                      "1px solid #1c1c1c",
                  }}
                >
                  <span
                    style={{
                      color:
                        "#555",

                      font:
                        "9px monospace",

                      letterSpacing:
                        ".08em",
                    }}
                  >
                    NO LICENSE DATA
                  </span>

                  <p className="user-muted">
                    License information
                    will appear here after
                    you acquire a product.
                  </p>
                </div>
              ) : (
                <div className="purchase-list">
                  {entitlements.map(
                    (
                      entitlement
                    ) => {
                      const product =
                        entitlement.products;

                      if (
                        !product
                      ) {
                        return null;
                      }

                      const activeActivation =
                        accountActivations.find(
                          (
                            activation
                          ) =>
                            activation.status ===
                            "active"
                        );

                      const latestActivation =
                        activeActivation ??
                        accountActivations[0] ??
                        null;

                      return (
                        <div
                          key={
                            entitlement.id
                          }
                          style={{
                            borderBottom:
                              "1px solid #1c1c1c",

                            padding:
                              "22px 0",
                          }}
                        >
                          <div
                            style={{
                              display:
                                "grid",

                              gridTemplateColumns:
                                "minmax(150px, 1.4fr) minmax(120px, 1fr) minmax(120px, 1fr) minmax(110px, .8fr)",

                              gap:
                                "18px",

                              alignItems:
                                "center",
                            }}
                          >
                            <div>
                              <span
                                style={{
                                  display:
                                    "block",

                                  marginBottom:
                                    "7px",

                                  color:
                                    "#555",

                                  font:
                                    "8px monospace",

                                  letterSpacing:
                                    ".08em",
                                }}
                              >
                                PRODUCT
                              </span>

                              <strong
                                style={{
                                  color:
                                    "#ccc",

                                  font:
                                    "10px monospace",
                                }}
                              >
                                {
                                  product.name
                                }
                              </strong>
                            </div>

                            <div>
                              <span
                                style={{
                                  display:
                                    "block",

                                  marginBottom:
                                    "7px",

                                  color:
                                    "#555",

                                  font:
                                    "8px monospace",

                                  letterSpacing:
                                    ".08em",
                                }}
                              >
                                ACCOUNT MACHINE
                              </span>

                              <strong
                                style={{
                                  color:
                                    "#999",

                                  font:
                                    "9px monospace",

                                  overflowWrap:
                                    "anywhere",
                                }}
                              >
                                {latestActivation
                                  ?.machine_id ??
                                  "NOT ACTIVATED"}
                              </strong>
                            </div>

                            <div>
                              <span
                                style={{
                                  display:
                                    "block",

                                  marginBottom:
                                    "7px",

                                  color:
                                    "#555",

                                  font:
                                    "8px monospace",

                                  letterSpacing:
                                    ".08em",
                                }}
                              >
                                STATUS
                              </span>

                              <strong
                                className={
                                  activeActivation
                                    ? "status-ok"
                                    : undefined
                                }
                              >
                                {activeActivation
                                  ? "ACTIVE"
                                  : latestActivation
                                    ? latestActivation.status.toUpperCase()
                                    : "NOT ACTIVATED"}
                              </strong>
                            </div>

                            <div>
                              <span
                                style={{
                                  display:
                                    "block",

                                  marginBottom:
                                    "7px",

                                  color:
                                    "#555",

                                  font:
                                    "8px monospace",

                                  letterSpacing:
                                    ".08em",
                                }}
                              >
                                ACTIVATED
                              </span>

                              <strong
                                style={{
                                  color:
                                    "#999",

                                  font:
                                    "9px monospace",
                                }}
                              >
                                {latestActivation
                                  ? formatDate(
                                      latestActivation.activated_at
                                    )
                                  : "—"}
                              </strong>
                            </div>
                          </div>

                          <div
                            style={{
                              marginTop:
                                "16px",
                            }}
                          >
                            <a
                              href={`/product?id=${product.slug}`}
                              style={{
                                display:
                                  "inline-block",

                                border:
                                  "1px solid #333",

                                padding:
                                  "8px 10px",

                                color:
                                  "#999",

                                font:
                                  "8px monospace",
                              }}
                            >
                              VIEW PRODUCT
                            </a>
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              )}

              {error &&
                activeSection ===
                  "license" && (
                  <p
                    style={{
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
            </section>

            {/* ==============================================
                REAL ORDERS & RECEIPTS
            ============================================== */}

            <section
              className={`user-section ${
                activeSection ===
                "orders"
                  ? "active"
                  : ""
              }`}
            >
              <div className="user-section-head">
                <div>
                  <span className="eyebrow">
                    ACCOUNT
                  </span>

                  <h1>
                    Orders & Receipts
                  </h1>
                </div>

                <span className="muted-count">
                  {ordersLoading
                    ? "loading..."
                    : `${orders.length} ${
                        orders.length ===
                        1
                          ? "order"
                          : "orders"
                      }`}
                </span>
              </div>

              {ordersLoading ? (
                <p className="user-muted">
                  loading orders...
                </p>
              ) : ordersError ? (
                <p
                  style={{
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
                  {ordersError}
                </p>
              ) : orders.length ===
                0 ? (
                <div
                  style={{
                    padding:
                      "60px 0",

                    borderBottom:
                      "1px solid #1c1c1c",
                  }}
                >
                  <span
                    style={{
                      color:
                        "#555",

                      font:
                        "9px monospace",

                      letterSpacing:
                        ".08em",
                    }}
                  >
                    NO ORDERS YET
                  </span>

                  <p className="user-muted">
                    Your paid orders will appear here after checkout.
                  </p>
                </div>
              ) : (
                <>
                  <div className="order-row order-head">
                    <strong>
                      PRODUCTS
                    </strong>

                    <span>
                      DATE
                    </span>

                    <span>
                      ORDER
                    </span>

                    <span>STATE</span>
                    <span>
                      AMOUNT
                    </span>
                  </div>

                  {orders.map(
                    (order) => {
                      const productNames =
                        order.order_items
                          .map(
                            (item) =>
                              item.products
                                ?.name
                          )
                          .filter(
                            (
                              name
                            ): name is string =>
                              Boolean(name)
                          )
                          .join(", ") ||
                        "—";

                      const orderReference =
                        formatOrderNumber(order.order_number);

                      return (
                        <div
                          className="order-row"
                          key={
                            order.id
                          }
                          title={`Status: ${order.status.toUpperCase()}`}
                        >
                          <strong>
                            {productNames}
                            {order.provider === "paddle_sandbox" &&
                              ["paid", "refunded", "partially_refunded"].includes(order.status) &&
                              Number(order.total) > 0 && order.provider_transaction_id && (
                                <OrderInvoice orderId={order.id} />
                              )}
                          </strong>

                          <span>
                            {formatDate(
                              order.provider_created_at ??
                                order.created_at
                            )}
                          </span>

                          <span>
                            {orderReference}
                          </span>

                          <span className={"order-state order-state-" + order.status}>{order.status.replaceAll("_", " ")}</span>
                          <span>
                            {formatMoney(
                              order.total,
                              order.currency
                            )}
                          </span>
                        </div>
                      );
                    }
                  )}

                  <p className="user-muted">
                    Invoices are available for paid Paddle orders, including refunded orders.
                  </p>
                </>
              )}
            </section>

            {/* ==============================================
                PAYMENT METHOD
            ============================================== */}

            <section
              className={`user-section ${
                activeSection ===
                "payment"
                  ? "active"
                  : ""
              }`}
            >
              <div className="user-section-head">
                <div>
                  <span className="eyebrow">
                    ACCOUNT
                  </span>

                  <h1>
                    Payment Method
                  </h1>
                </div>
              </div>

              <p className="user-muted">
                Payment details will be
                handled by the payment
                provider rather than
                stored directly by
                qatools.
              </p>
            </section>

            {/* ==============================================
                GENERAL / PERSONAL INFORMATION
            ============================================== */}

            <section
              className={`user-section ${
                activeSection ===
                "general"
                  ? "active"
                  : ""
              }`}
            >
              <div className="user-section-head">
                <div>
                  <span className="eyebrow">
                    ACCOUNT
                  </span>

                  <h1>
                    General / Personal Information
                  </h1>
                </div>

                <span className="muted-count">
                  logged in
                </span>
              </div>

              {profileLoading ? (
                <p className="user-muted">
                  loading profile...
                </p>
              ) : (
                <form
                  className="profile-form"
                  onSubmit={
                    handleSaveProfile
                  }
                >
                  <label>
                    Email

                    <input
                      type="email"
                      value={
                        user.email ??
                        ""
                      }
                      readOnly
                    />
                  </label>

                  <label>
                    Name

                    <input
                      type="text"
                      value={
                        profileName
                      }
                      onChange={(
                        event
                      ) =>
                        setProfileName(
                          event.target
                            .value
                        )
                      }
                      placeholder="Your name"
                    />
                  </label>

                  <label>
                    Invoice details

                    <textarea
                      value={
                        invoiceDetails
                      }
                      onChange={(
                        event
                      ) =>
                        setInvoiceDetails(
                          event.target
                            .value
                        )
                      }
                      placeholder="Optional invoice data"
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={
                      profileSaving
                    }
                  >
                    {profileSaving
                      ? "SAVING..."
                      : "SAVE CHANGES"}
                  </button>
                </form>
              )}

              <PasswordForm key={user.id} />

              {message && (
                <p
                  style={{
                    maxWidth:
                      "620px",

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

              {error &&
                activeSection ===
                  "general" && (
                  <p
                    style={{
                      maxWidth:
                        "620px",

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
                    "620px",

                  marginTop:
                    "52px",

                  paddingTop:
                    "20px",

                  borderTop:
                    "1px solid #1c1c1c",
                }}
              >
                <button
                  type="button"
                  disabled={
                    busy
                  }
                  onClick={
                    handleLogOut
                  }
                  style={{
                    border:
                      "1px solid #333",

                    background:
                      "transparent",

                    color:
                      "#999",

                    padding:
                      "9px 11px",

                    cursor:
                      busy
                        ? "default"
                        : "pointer",

                    opacity:
                      busy
                        ? 0.5
                        : 1,

                    font:
                      "8px monospace",
                  }}
                >
                  {busy
                    ? "LOGGING OUT..."
                    : "LOG OUT"}
                </button>
              </div>
            </section>
          </section>
        </main>
      ) : (

        /* ==================================================
           LOGGED-OUT ACCOUNT PAGE
        ================================================== */

        <main className="standalone-page">
          <span className="eyebrow">
            ACCOUNT
          </span>

          <h1>
            {authMode ===
            "login"
              ? "Log in to qatools."
              : authMode ===
                  "signup"
                ? "Create your qatools account."
                : "Reset your password."}
          </h1>

          <p>
            {authMode ===
            "login"
              ? "Access your purchases, downloads and license information."
              : authMode ===
                  "signup"
                ? "Create one account for purchases, downloads and tool activation."
                : "Enter your email and we will send you a password reset link."}
          </p>

          <form
            onSubmit={
              handleSubmit
            }
            style={{
              maxWidth:
                "470px",

              marginTop:
                "48px",

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
                    "9px monospace",
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
                    "9px monospace",
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
                    "9px monospace",
                }}
              >
                FORGOT PASSWORD
              </button>
            )}
          </div>
        </main>
      )}

      <footer>
        <span>
          qatools.studio
        </span>

        <span>
          account
        </span>
      </footer>
    </div>
  );
}
