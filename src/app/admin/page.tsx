"use client";
import AccountName from "@/components/AccountName";

import {
  useEffect,
  useState,
} from "react";

import { useAuth } from "@/context/AuthContext";
import { useQAToolsState } from "@/context/QAToolsState";
import { supabase } from "@/lib/supabase";
import AdminProducts from "@/components/AdminProducts";
import AdminOrders from "@/components/AdminOrders";
import AdminPaymentReview from "@/components/AdminPaymentReview";
import AdminDownloads from "@/components/AdminDownloads";
import AdminPrices from "@/components/AdminPrices";
import AdminActivationHistory, { type AdminActivation } from "@/components/AdminActivationHistory";

type AdminState =
  | "checking"
  | "admin"
  | "not-admin";

type CustomerProduct = {
  id: string | number;
  name: string;
  slug: string;
};

type AdminProduct = {
  id: string | number;
  name: string;
  slug: string;
  published: boolean;
};

type CustomerActivation = AdminActivation;

type CustomerEntitlement = {
  id: string | number;
  user_id: string;
  product_id:
    | string
    | number;
  status: string;
  source: string;
  granted_at: string;

  products:
    | CustomerProduct
    | null;

  license_activations:
    CustomerActivation[];
};

type Customer = {
  account_activations: CustomerActivation[];
  id: string;
  email: string | null;
  emailConfirmedAt:
    | string
    | null;
  createdAt: string;
  lastSignInAt:
    | string
    | null;
  name: string | null;
  invoiceDetails:
    | string
    | null;
  entitlements:
    CustomerEntitlement[];
};

type CustomersResponse = {
  customers?: Customer[];
  products?: AdminProduct[];
  error?: string;
};

type GrantResponse = {
  message?: string;
  error?: string;
};

type GrantMessage = {
  kind:
    | "success"
    | "error";
  text: string;
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

export default function AdminPage() {
  const [adminSection, setAdminSection] = useState("dashboard");
  useEffect(() => { const section = new URLSearchParams(window.location.search).get("section"); if (section && ["products", "downloads", "prices"].includes(section)) setAdminSection(section); }, []);

  const {
    user,
    loading,
  } = useAuth();

  const {
    likedCount,
    cartCount,
  } = useQAToolsState();

  const [
    adminState,
    setAdminState,
  ] =
    useState<AdminState>(
      "checking"
    );

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null
    );

  const [
    customers,
    setCustomers,
  ] =
    useState<Customer[]>(
      []
    );

  const [
    products,
    setProducts,
  ] =
    useState<AdminProduct[]>(
      []
    );

  const [
    customersLoading,
    setCustomersLoading,
  ] =
    useState(false);

  const [
    customersError,
    setCustomersError,
  ] =
    useState<string | null>(
      null
    );

  const [
    openCustomer,
    setOpenCustomer,
  ] =
    useState<string | null>(
      null
    );

  const [
    selectedProducts,
    setSelectedProducts,
  ] =
    useState<
      Record<string, string>
    >({});

  const [
    grantingCustomerId,
    setGrantingCustomerId,
  ] =
    useState<string | null>(
      null
    );

  const [
    grantMessages,
    setGrantMessages,
  ] =
    useState<
      Record<
        string,
        GrantMessage
      >
    >({});

  const [
    refreshCounter,
    setRefreshCounter,
  ] =
    useState(0);

  /*
    --------------------------------------------------
    BROWSER ADMIN MEMBERSHIP CHECK
    --------------------------------------------------

    This controls what the user sees.

    The secure API performs its own independent
    authorization check.
  */
  useEffect(() => {
    if (loading) {
      return;
    }

    if (!user) {
      setAdminState(
        "not-admin"
      );

      return;
    }

    let cancelled =
      false;

    async function checkAdmin() {
      setAdminState(
        "checking"
      );

      setError(null);

      const {
        data,
        error:
          adminError,
      } =
        await supabase
          .from(
            "admin_users"
          )
          .select(
            "user_id"
          )
          .eq(
            "user_id",
            user!.id
          )
          .maybeSingle();

      if (cancelled) {
        return;
      }

      if (adminError) {
        setError(
          adminError.message
        );

        setAdminState(
          "not-admin"
        );

        return;
      }

      setAdminState(
        data
          ? "admin"
          : "not-admin"
      );
    }

    checkAdmin();

    return () => {
      cancelled = true;
    };
  }, [
    user,
    loading,
  ]);

  /*
    --------------------------------------------------
    LOAD REAL CUSTOMER + PRODUCT DATA
    --------------------------------------------------
  */
  useEffect(() => {
    if (
      !user ||
      adminState !== "admin"
    ) {
      setCustomers([]);
      setProducts([]);

      return;
    }

    let cancelled =
      false;

    async function loadCustomers() {
      setCustomersLoading(
        true
      );

      setCustomersError(
        null
      );

      const {
        data: sessionData,
        error: sessionError,
      } =
        await supabase.auth
          .getSession();

      if (cancelled) {
        return;
      }

      if (
        sessionError ||
        !sessionData.session
      ) {
        setCustomersError(
          sessionError?.message ??
            "No active session."
        );

        setCustomersLoading(
          false
        );

        return;
      }

      try {
        const response =
          await fetch(
            "/api/admin/customers",
            {
              method: "GET",

              headers: {
                Authorization:
                  `Bearer ${sessionData.session.access_token}`,
              },

              cache:
                "no-store",
            }
          );

        const body =
          (await response.json()) as
            CustomersResponse;

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setCustomersError(
            body.error ??
              "Unable to load customers."
          );

          setCustomersLoading(
            false
          );

          return;
        }

        setCustomers(
          body.customers ??
            []
        );

        setProducts(
          body.products ??
            []
        );

        setCustomersLoading(
          false
        );
      } catch (requestError) {
        if (cancelled) {
          return;
        }

        setCustomersError(
          requestError instanceof
            Error
            ? requestError.message
            : "Unable to load customers."
        );

        setCustomersLoading(
          false
        );
      }
    }

    loadCustomers();

    return () => {
      cancelled = true;
    };
  }, [
    user,
    adminState,
    refreshCounter,
  ]);

  function toggleCustomer(
    customerId: string
  ) {
    setOpenCustomer(
      (current) =>
        current ===
        customerId
          ? null
          : customerId
    );
  }

  function getAvailableProducts(
    customer: Customer
  ) {
    return products.filter(
      (product) =>
        !customer.entitlements.some(
          (entitlement) =>
            String(
              entitlement.product_id
            ) ===
            String(product.id)
        )
    );
  }

  async function grantEntitlement(
    customer: Customer
  ) {
    if (
      !customer.emailConfirmedAt
    ) {
      setGrantMessages(
        (current) => ({
          ...current,

          [customer.id]: {
            kind:
              "error",

            text:
              "This account has not confirmed its email yet.",
          },
        })
      );

      return;
    }

    const availableProducts =
      getAvailableProducts(
        customer
      );

    const selectedProductId =
      selectedProducts[
        customer.id
      ] ??
      (
        availableProducts[0]
          ?.id !== undefined
          ? String(
              availableProducts[0]
                .id
            )
          : ""
      );

    if (!selectedProductId) {
      setGrantMessages(
        (current) => ({
          ...current,

          [customer.id]: {
            kind:
              "error",

            text:
              "No product is available to grant.",
          },
        })
      );

      return;
    }

    setGrantingCustomerId(
      customer.id
    );

    setGrantMessages(
      (current) => {
        const next = {
          ...current,
        };

        delete next[
          customer.id
        ];

        return next;
      }
    );

    try {
      const {
        data: sessionData,
        error: sessionError,
      } =
        await supabase.auth
          .getSession();

      if (
        sessionError ||
        !sessionData.session
      ) {
        setGrantMessages(
          (current) => ({
            ...current,

            [customer.id]: {
              kind:
                "error",

              text:
                sessionError
                  ?.message ??
                "No active admin session.",
            },
          })
        );

        return;
      }

      const response =
        await fetch(
          "/api/admin/entitlements/grant",
          {
            method:
              "POST",

            headers: {
              Authorization:
                `Bearer ${sessionData.session.access_token}`,

              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                userId:
                  customer.id,

                productId:
                  selectedProductId,
              }),
          }
        );

      const body =
        (await response.json()) as
          GrantResponse;

      if (!response.ok) {
        setGrantMessages(
          (current) => ({
            ...current,

            [customer.id]: {
              kind:
                "error",

              text:
                body.error ??
                "Unable to grant entitlement.",
            },
          })
        );

        return;
      }

      setGrantMessages(
        (current) => ({
          ...current,

          [customer.id]: {
            kind:
              "success",

            text:
              body.message ??
              "Entitlement granted successfully.",
          },
        })
      );

      setSelectedProducts(
        (current) => {
          const next = {
            ...current,
          };

          delete next[
            customer.id
          ];

          return next;
        }
      );

      setRefreshCounter(
        (current) =>
          current + 1
      );
    } catch (
      requestError
    ) {
      setGrantMessages(
        (current) => ({
          ...current,

          [customer.id]: {
            kind:
              "error",

            text:
              requestError instanceof
                Error
                ? requestError.message
                : "Unable to grant entitlement.",
          },
        })
      );
    } finally {
      setGrantingCustomerId(
        null
      );
    }
  }

  const entitlementCount =
    customers.reduce(
      (
        total,
        customer
      ) =>
        total +
        customer.entitlements.length,
      0
    );

  const activeActivationCount = customers.reduce((total, customer) =>
    total + customer.account_activations.filter(a => a.status === "active").length, 0);

  return (
    <div className="content-page">
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
            className="icon-link"
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

      {loading ||
      adminState ===
        "checking" ? (
        <main
          style={{
            padding:
              "60px 26px",

            fontFamily:
              "monospace",

            color:
              "#666",
          }}
        >
          checking admin access...
        </main>
      ) : !user ? (
        <main className="standalone-page">
          <span className="eyebrow">
            ADMIN
          </span>

          <h1>
            Admin access requires
            an account.
          </h1>

          <p>
            Log in with your qatools
            administrator account to
            continue.
          </p>

          <a
            href="/user"
            style={{
              display:
                "inline-block",

              marginTop:
                "28px",

              border:
                "1px solid #ededeb",

              padding:
                "10px 14px",

              color:
                "#ededeb",

              font:
                "9px monospace",
            }}
          >
            LOG IN
          </a>
        </main>
      ) : adminState ===
        "not-admin" ? (
        <main className="standalone-page">
          <span className="eyebrow">
            ADMIN
          </span>

          <h1>
            Access unavailable.
          </h1>

          <p>
            This account does not have
            qatools administrator
            access.
          </p>

          {error && (
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

          <a
            href="/"
            style={{
              display:
                "inline-block",

              marginTop:
                "28px",

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
            BACK TO PRODUCTS
          </a>
        </main>
      ) : (
        <main className="admin-workspace">
          <aside className="user-sidebar">
            <div className="user-title">ADMIN</div>
            <nav aria-label="Admin sections">
              {[["dashboard", "Dashboard"], ["customers", "Customers / Accounts"], ["orders", "Orders"], ["products", "Products"], ["payments", "Payment review"], ["downloads", "Tool files"], ["prices", "Paddle prices"]].map(([id, label]) =>
                <button key={id} type="button" className={"user-nav " + (adminSection === id ? "active" : "")} aria-current={adminSection === id ? "page" : undefined} onClick={() => setAdminSection(id)}>{label}</button>)}
            </nav>
          </aside>
          <div className="admin-workspace-content">
          <div
            style={{
              display:
                "flex",

              justifyContent:
                "space-between",

              alignItems:
                "flex-start",

              gap:
                "30px",

              paddingBottom:
                "30px",

              borderBottom:
                "1px solid #1c1c1c",
            }}
          >
            <div>
              <span className="eyebrow">
                qatools
              </span>

              <h1
                style={{
                  margin:
                    "10px 0 0",

                  fontSize:
                    "32px",

                  fontWeight:
                    400,
                }}
              >
                Admin
              </h1>

              <p
                style={{
                  maxWidth:
                    "620px",

                  marginTop:
                    "16px",

                  color:
                    "#777",

                  font:
                    "10px monospace",

                  lineHeight:
                    1.7,
                }}
              >
                Internal management
                area for qatools.
              </p>
            </div>

            <span
              style={{
                border:
                  "1px solid #295a34",

                padding:
                  "7px 9px",

                color:
                  "#55b86d",

                font:
                  "8px monospace",

                letterSpacing:
                  ".08em",
              }}
            >
              ADMIN ACCESS
            </span>
          </div>

          <section
            style={{
              paddingTop:
                "38px",
            }}
          >
            <div hidden={adminSection !== "dashboard"}>
            <div
              style={{
                display:
                  "grid",

                gridTemplateColumns:
                  "repeat(auto-fit, minmax(220px, 1fr))",

                gap:
                  "14px",
              }}
            >
              <div
                style={{
                  minHeight:
                    "150px",

                  border:
                    "1px solid #242424",

                  padding:
                    "20px",
                }}
              >
                <span
                  style={{
                    color:
                      "#555",

                    font:
                      "8px monospace",

                    letterSpacing:
                      ".08em",
                  }}
                >
                  CUSTOMERS
                </span>

                <h2
                  style={{
                    margin:
                      "18px 0 8px",

                    fontSize:
                      "16px",

                    fontWeight:
                      400,
                  }}
                >
                  Customer Accounts
                </h2>

                <p
                  style={{
                    margin:
                      "0",

                    color:
                      "#999",

                    font:
                      "24px monospace",
                  }}
                >
                  {customersLoading
                    ? "—"
                    : customers.length}
                </p>

                <p
                  style={{
                    marginTop:
                      "8px",

                    color:
                      "#666",

                    font:
                      "9px monospace",

                    lineHeight:
                      1.6,
                  }}
                >
                  Real Supabase Auth
                  accounts.
                </p>
              </div>

              <div
                style={{
                  minHeight:
                    "150px",

                  border:
                    "1px solid #242424",

                  padding:
                    "20px",
                }}
              >
                <span
                  style={{
                    color:
                      "#555",

                    font:
                      "8px monospace",

                    letterSpacing:
                      ".08em",
                  }}
                >
                  OWNERSHIP
                </span>

                <h2
                  style={{
                    margin:
                      "18px 0 8px",

                    fontSize:
                      "16px",

                    fontWeight:
                      400,
                  }}
                >
                  Entitlements
                </h2>

                <p
                  style={{
                    margin:
                      "0",

                    color:
                      "#999",

                    font:
                      "24px monospace",
                  }}
                >
                  {customersLoading
                    ? "—"
                    : entitlementCount}
                </p>

                <p
                  style={{
                    marginTop:
                      "8px",

                    color:
                      "#666",

                    font:
                      "9px monospace",

                    lineHeight:
                      1.6,
                  }}
                >
                  Current product
                  ownership records.
                </p>
              </div>

              <div
                style={{
                  minHeight:
                    "150px",

                  border:
                    "1px solid #242424",

                  padding:
                    "20px",
                }}
              >
                <span
                  style={{
                    color:
                      "#555",

                    font:
                      "8px monospace",

                    letterSpacing:
                      ".08em",
                  }}
                >
                  LICENSING
                </span>

                <h2
                  style={{
                    margin:
                      "18px 0 8px",

                    fontSize:
                      "16px",

                    fontWeight:
                      400,
                  }}
                >
                  Activations
                </h2>

                <p
                  style={{
                    margin:
                      "0",

                    color:
                      "#999",

                    font:
                      "24px monospace",
                  }}
                >
                  {customersLoading
                    ? "—"
                    : activeActivationCount}
                </p>

                <p
                  style={{
                    marginTop:
                      "8px",

                    color:
                      "#666",

                    font:
                      "9px monospace",

                    lineHeight:
                      1.6,
                  }}
                >
                  Active machine
                  activations.
                </p>
              </div>

              <div
                style={{
                  minHeight:
                    "150px",

                  border:
                    "1px solid #242424",

                  padding:
                    "20px",
                }}
              >
                <span
                  style={{
                    color:
                      "#555",

                    font:
                      "8px monospace",

                    letterSpacing:
                      ".08em",
                  }}
                >
                  SALES
                </span>

                <h2
                  style={{
                    margin:
                      "18px 0 8px",

                    fontSize:
                      "16px",

                    fontWeight:
                      400,
                  }}
                >
                  Orders
                </h2>

                <p
                  style={{
                    color:
                      "#666",

                    font:
                      "9px monospace",

                    lineHeight:
                      1.6,
                  }}
                >
                  Review order history in the Orders section.
                </p>
              </div>
            </div>

            </div>
            {adminSection === "products" && <AdminProducts key={`products-${user.id}`} />}
            {adminSection === "orders" && <AdminOrders key={`orders-${user.id}`} />}
            {adminSection === "payments" && <AdminPaymentReview key={`payment-review-${user.id}`} />}
            {adminSection === "downloads" && <AdminDownloads key={`downloads-${user.id}`} products={products} />}
            {adminSection === "prices" && <AdminPrices key={`prices-${user.id}`} products={products} />}

            <section hidden={adminSection !== "customers"}
              style={{
                marginTop:
                  "48px",
              }}
            >
              <div
                style={{
                  display:
                    "flex",

                  justifyContent:
                    "space-between",

                  alignItems:
                    "flex-end",

                  gap:
                    "24px",

                  paddingBottom:
                    "18px",

                  borderBottom:
                    "1px solid #242424",
                }}
              >
                <div>
                  <span
                    style={{
                      color:
                        "#555",

                      font:
                        "8px monospace",

                      letterSpacing:
                        ".08em",
                    }}
                  >
                    CUSTOMERS
                  </span>

                  <h2
                    style={{
                      margin:
                        "8px 0 0",

                      fontSize:
                        "20px",

                      fontWeight:
                        400,
                    }}
                  >
                    Customer Accounts
                  </h2>
                </div>

                <span
                  style={{
                    color:
                      "#666",

                    font:
                      "9px monospace",
                  }}
                >
                  {customersLoading
                    ? "loading..."
                    : `${customers.length} ${
                        customers.length ===
                        1
                          ? "account"
                          : "accounts"
                      }`}
                </span>
              </div>

              {customersLoading ? (
                <p
                  style={{
                    marginTop:
                      "24px",

                    color:
                      "#666",

                    font:
                      "10px monospace",
                  }}
                >
                  loading customer
                  accounts...
                </p>
              ) : customersError ? (
                <p
                  style={{
                    marginTop:
                      "24px",

                    color:
                      "#e86565",

                    font:
                      "10px monospace",

                    lineHeight:
                      1.6,
                  }}
                >
                  {customersError}
                </p>
              ) : customers.length ===
                0 ? (
                <p
                  style={{
                    marginTop:
                      "24px",

                    color:
                      "#666",

                    font:
                      "10px monospace",
                  }}
                >
                  no customer accounts
                  found
                </p>
              ) : (
                <div
                  style={{
                    overflowX:
                      "auto",
                  }}
                >
                  <div
                    style={{
                      minWidth:
                        "850px",
                    }}
                  >
                    <div
                      style={{
                        display:
                          "grid",

                        gridTemplateColumns:
                          "minmax(190px, 1.5fr) minmax(110px, 1fr) 100px 100px 110px 30px",

                        gap:
                          "16px",

                        padding:
                          "12px 10px",

                        borderBottom:
                          "1px solid #242424",

                        color:
                          "#555",

                        font:
                          "8px monospace",

                        letterSpacing:
                          ".08em",
                      }}
                    >
                      <span>
                        ACCOUNT
                      </span>

                      <span>
                        NAME
                      </span>

                      <span>
                        STATUS
                      </span>

                      <span>
                        PRODUCTS
                      </span>

                      <span>
                        LAST LOGIN
                      </span>

                      <span />
                    </div>

                    {customers.map(
                      (
                        customer
                      ) => {
                        const isOpen =
                          openCustomer ===
                          customer.id;

                        const confirmed =
                          Boolean(
                            customer.emailConfirmedAt
                          );

                        const hasProfileData =
                          Boolean(
                            customer.name ||
                            customer.invoiceDetails
                          );

                        const activeActivations = customer.account_activations.filter(a => a.status === "active").length;

                        const availableProducts =
                          getAvailableProducts(
                            customer
                          );

                        const selectedProductId =
                          selectedProducts[
                            customer.id
                          ] ??
                          (
                            availableProducts[0]
                              ?.id !== undefined
                              ? String(
                                  availableProducts[0]
                                    .id
                                )
                              : ""
                          );

                        const grantMessage =
                          grantMessages[
                            customer.id
                          ];

                        const isGranting =
                          grantingCustomerId ===
                          customer.id;

                        return (
                          <div
                            key={
                              customer.id
                            }
                          >
                            <button
                              type="button"
                              onClick={() =>
                                toggleCustomer(
                                  customer.id
                                )
                              }
                              style={{
                                width:
                                  "100%",

                                display:
                                  "grid",

                                gridTemplateColumns:
                                  "minmax(190px, 1.5fr) minmax(110px, 1fr) 100px 100px 110px 30px",

                                gap:
                                  "16px",

                                alignItems:
                                  "center",

                                padding:
                                  "15px 10px",

                                border:
                                  "0",

                                borderBottom:
                                  "1px solid #1c1c1c",

                                background:
                                  isOpen
                                    ? "#111"
                                    : "transparent",

                                color:
                                  "#999",

                                textAlign:
                                  "left",

                                cursor:
                                  "pointer",

                                font:
                                  "9px monospace",
                              }}
                            >
                              <strong
                                style={{
                                  color:
                                    "#ccc",

                                  overflowWrap:
                                    "anywhere",
                                }}
                              >
                                {customer.email ??
                                  customer.id}
                              </strong>

                              <span>
                                {customer.name ??
                                  "—"}
                              </span>

                              <span
                                style={{
                                  color:
                                    confirmed
                                      ? "#55b86d"
                                      : "#d89a55",
                                }}
                              >
                                {confirmed
                                  ? "CONFIRMED"
                                  : "UNCONFIRMED"}
                              </span>

                              <span>
                                {
                                  customer
                                    .entitlements
                                    .length
                                }
                              </span>

                              <span>
                                {formatDate(
                                  customer.lastSignInAt
                                )}
                              </span>

                              <span>
                                {isOpen
                                  ? "⌃"
                                  : "⌄"}
                              </span>
                            </button>

                            {isOpen && (
                              <div
                                style={{
                                  padding:
                                    "20px",

                                  borderBottom:
                                    "1px solid #242424",

                                  background:
                                    "#0f0f0f",
                                }}
                              >
                                <div
                                  style={{
                                    display:
                                      "grid",

                                    gridTemplateColumns:
                                      "repeat(auto-fit, minmax(180px, 1fr))",

                                    gap:
                                      "18px",
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
                                      USER ID
                                    </span>

                                    <strong
                                      style={{
                                        color:
                                          "#888",

                                        font:
                                          "8px monospace",

                                        overflowWrap:
                                          "anywhere",
                                      }}
                                    >
                                      {
                                        customer.id
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
                                      ACCOUNT CREATED
                                    </span>

                                    <strong
                                      style={{
                                        color:
                                          "#999",

                                        font:
                                          "9px monospace",
                                      }}
                                    >
                                      {formatDate(
                                        customer.createdAt
                                      )}
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
                                      EMAIL STATUS
                                    </span>

                                    <strong
                                      style={{
                                        color:
                                          confirmed
                                            ? "#55b86d"
                                            : "#d89a55",

                                        font:
                                          "9px monospace",
                                      }}
                                    >
                                      {confirmed
                                        ? "CONFIRMED"
                                        : "UNCONFIRMED"}
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
                                      PROFILE DATA
                                    </span>

                                    <strong
                                      style={{
                                        color:
                                          hasProfileData
                                            ? "#999"
                                            : "#666",

                                        font:
                                          "9px monospace",
                                      }}
                                    >
                                      {hasProfileData
                                        ? "AVAILABLE"
                                        : "EMPTY"}
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
                                      ACTIVE ACTIVATIONS
                                    </span>

                                    <strong
                                      style={{
                                        color:
                                          activeActivations >
                                          0
                                            ? "#55b86d"
                                            : "#999",

                                        font:
                                          "9px monospace",
                                      }}
                                    >
                                      {
                                        activeActivations
                                      }
                                    </strong>
                                  </div>
                                </div>

                                <div
                                  style={{
                                    marginTop:
                                      "24px",

                                    paddingTop:
                                      "18px",

                                    borderTop:
                                      "1px solid #1c1c1c",
                                  }}
                                >
                                  <span
                                    style={{
                                      display:
                                        "block",

                                      marginBottom:
                                        "12px",

                                      color:
                                        "#555",

                                      font:
                                        "8px monospace",

                                      letterSpacing:
                                        ".08em",
                                    }}
                                  >
                                    PROFILE
                                  </span>

                                  <div
                                    style={{
                                      display:
                                        "grid",

                                      gridTemplateColumns:
                                        "repeat(auto-fit, minmax(220px, 1fr))",

                                      gap:
                                        "18px",
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
                                        NAME
                                      </span>

                                      <span
                                        style={{
                                          color:
                                            "#999",

                                          font:
                                            "9px monospace",

                                          whiteSpace:
                                            "pre-wrap",
                                        }}
                                      >
                                        {customer.name ??
                                          "—"}
                                      </span>
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
                                        INVOICE DETAILS
                                      </span>

                                      <span
                                        style={{
                                          color:
                                            "#999",

                                          font:
                                            "9px monospace",

                                          whiteSpace:
                                            "pre-wrap",
                                        }}
                                      >
                                        {customer.invoiceDetails ??
                                          "—"}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div
                                  style={{
                                    marginTop:
                                      "24px",

                                    paddingTop:
                                      "18px",

                                    borderTop:
                                      "1px solid #1c1c1c",
                                  }}
                                >
                                  <span
                                    style={{
                                      display:
                                        "block",

                                      marginBottom:
                                        "12px",

                                      color:
                                        "#555",

                                      font:
                                        "8px monospace",

                                      letterSpacing:
                                        ".08em",
                                    }}
                                  >
                                    ENTITLEMENTS
                                  </span>

                                  <AdminActivationHistory
                                    activations={customer.account_activations}
                                    onRefresh={() => setRefreshCounter(value => value + 1)}
                                    onReleased={(released) => setCustomers(current => current.map(c => c.id !== customer.id ? c : {
                                      ...c,
                                      account_activations: c.account_activations.map(a => String(a.id) === String(released.id) ? released : a),
                                    }))}
                                  />

                                  {customer
                                    .entitlements
                                    .length ===
                                  0 ? (
                                    <span
                                      style={{
                                        color:
                                          "#666",

                                        font:
                                          "9px monospace",
                                      }}
                                    >
                                      NO PRODUCTS
                                    </span>
                                  ) : (
                                    customer.entitlements.map(
                                      (
                                        entitlement
                                      ) => {
                                        const activeActivation = entitlement.status === "active" &&
                                          customer.account_activations.find(
                                            (
                                              activation
                                            ) =>
                                              activation.status ===
                                              "active"
                                          );

                                        return (
                                          <div
                                            key={
                                              entitlement.id
                                            }
                                            style={{
                                              display:
                                                "grid",

                                              gridTemplateColumns:
                                                "minmax(150px, 1.4fr) 100px 90px minmax(160px, 1fr) 100px",

                                              gap:
                                                "16px",

                                              padding:
                                                "11px 0",

                                              borderTop:
                                                "1px solid #1a1a1a",

                                              color:
                                                "#888",

                                              font:
                                                "9px monospace",
                                            }}
                                          >
                                            <strong
                                              style={{
                                                color:
                                                  "#bbb",
                                              }}
                                            >
                                              {entitlement.products
                                                ?.name ??
                                                "Unknown product"}
                                            </strong>

                                            <span>
                                              {entitlement.status.toUpperCase()}
                                            </span>

                                            <span>
                                              {entitlement.source.toUpperCase()}
                                            </span>

                                            <span
                                              style={{
                                                overflowWrap:
                                                  "anywhere",
                                              }}
                                            >
                                              {(activeActivation || undefined)
                                                ?.machine_id ??
                                                "NOT ACTIVATED"}
                                            </span>

                                            <span
                                              style={{
                                                color:
                                                  activeActivation
                                                    ? "#55b86d"
                                                    : "#777",
                                              }}
                                            >
                                              {activeActivation
                                                ? "ACTIVE"
                                                : "—"}
                                            </span>
                                            <AdminActivationHistory activations={entitlement.license_activations} legacy />
                                          </div>
                                        );
                                      }
                                    )
                                  )}
                                </div>

                                <div
                                  style={{
                                    marginTop:
                                      "26px",

                                    padding:
                                      "20px",

                                    border:
                                      "1px solid #242424",

                                    background:
                                      "#0b0b0b",
                                  }}
                                >
                                  <span
                                    style={{
                                      display:
                                        "block",

                                      color:
                                        "#555",

                                      font:
                                        "8px monospace",

                                      letterSpacing:
                                        ".08em",
                                    }}
                                  >
                                    ADMIN ACTION
                                  </span>

                                  <h3
                                    style={{
                                      margin:
                                        "10px 0 6px",

                                      color:
                                        "#bbb",

                                      fontSize:
                                        "14px",

                                      fontWeight:
                                        400,
                                    }}
                                  >
                                    Grant Entitlement
                                  </h3>

                                  <p
                                    style={{
                                      margin:
                                        "0",

                                      maxWidth:
                                        "650px",

                                      color:
                                        "#666",

                                      font:
                                        "9px monospace",

                                      lineHeight:
                                        1.6,
                                    }}
                                  >
                                    Manually grant permanent
                                    product ownership to this
                                    customer. The entitlement
                                    will be recorded with source
                                    ADMIN.
                                  </p>

                                  {!confirmed && (
                                    <p
                                      style={{
                                        marginTop:
                                          "14px",

                                        color:
                                          "#d89a55",

                                        font:
                                          "9px monospace",

                                        lineHeight:
                                          1.6,
                                      }}
                                    >
                                      This account has not
                                      confirmed its email.
                                      Entitlements cannot be
                                      granted yet.
                                    </p>
                                  )}

                                  {confirmed &&
                                  availableProducts.length ===
                                    0 && (
                                    <p
                                      style={{
                                        marginTop:
                                          "14px",

                                        color:
                                          "#666",

                                        font:
                                          "9px monospace",
                                      }}
                                    >
                                      This customer already has
                                      an entitlement record for
                                      every product.
                                    </p>
                                  )}

                                  {confirmed &&
                                    availableProducts.length >
                                      0 && (
                                      <div
                                        style={{
                                          display:
                                            "flex",

                                          flexWrap:
                                            "wrap",

                                          alignItems:
                                            "center",

                                          gap:
                                            "10px",

                                          marginTop:
                                            "18px",
                                        }}
                                      >
                                        <select
                                          value={
                                            selectedProductId
                                          }
                                          onChange={(
                                            event
                                          ) =>
                                            setSelectedProducts(
                                              (
                                                current
                                              ) => ({
                                                ...current,

                                                [customer.id]:
                                                  event
                                                    .target
                                                    .value,
                                              })
                                            )
                                          }
                                          disabled={
                                            isGranting
                                          }
                                          style={{
                                            minWidth:
                                              "230px",

                                            border:
                                              "1px solid #333",

                                            background:
                                              "#101010",

                                            color:
                                              "#aaa",

                                            padding:
                                              "9px 10px",

                                            font:
                                              "9px monospace",
                                          }}
                                        >
                                          {availableProducts.map(
                                            (
                                              product
                                            ) => (
                                              <option
                                                key={
                                                  product.id
                                                }
                                                value={String(
                                                  product.id
                                                )}
                                              >
                                                {
                                                  product.name
                                                }
                                                {!product.published
                                                  ? " — UNPUBLISHED"
                                                  : ""}
                                              </option>
                                            )
                                          )}
                                        </select>

                                        <button
                                          type="button"
                                          disabled={
                                            isGranting
                                          }
                                          onClick={() =>
                                            grantEntitlement(
                                              customer
                                            )
                                          }
                                          style={{
                                            border:
                                              "1px solid #295a34",

                                            background:
                                              "transparent",

                                            color:
                                              isGranting
                                                ? "#666"
                                                : "#55b86d",

                                            padding:
                                              "9px 12px",

                                            cursor:
                                              isGranting
                                                ? "default"
                                                : "pointer",

                                            font:
                                              "8px monospace",

                                            letterSpacing:
                                              ".06em",
                                          }}
                                        >
                                          {isGranting
                                            ? "GRANTING..."
                                            : "GRANT ENTITLEMENT"}
                                        </button>
                                      </div>
                                    )}

                                  {grantMessage && (
                                    <p
                                      style={{
                                        marginTop:
                                          "14px",

                                        color:
                                          grantMessage.kind ===
                                          "success"
                                            ? "#55b86d"
                                            : "#e86565",

                                        font:
                                          "9px monospace",

                                        lineHeight:
                                          1.6,
                                      }}
                                    >
                                      {
                                        grantMessage.text
                                      }
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              )}
            </section>

            <div
              style={{
                marginTop:
                  "42px",

                paddingTop:
                  "22px",

                borderTop:
                  "1px solid #1c1c1c",
              }}
            >
              <span
                style={{
                  color:
                    "#555",

                  font:
                    "8px monospace",

                  letterSpacing:
                    ".08em",
                }}
              >
                CURRENT ADMIN
              </span>

              <p
                style={{
                  marginTop:
                    "10px",

                  color:
                    "#999",

                  font:
                    "10px monospace",
                }}
              >
                {user.email ??
                  user.id}
              </p>
            </div>
          </section>
          </div>
        </main>
      )}

      <footer>
        <span>
          qatools.studio
        </span>

        <span>
          admin
        </span>
      </footer>
    </div>
  );
}
