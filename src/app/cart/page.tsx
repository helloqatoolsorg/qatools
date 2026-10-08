"use client";
import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";
import OutlineIcon from "@/components/OutlineIcon";
import AccountName from "@/components/AccountName";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import SandboxCheckout from "@/components/SandboxCheckout";

import {
  formatCartPrice,
  getCartProductImage,
  useCartProducts,
} from "@/hooks/useCartProducts";

import { useQAToolsState } from "@/context/QAToolsState";

export default function CartPage() {
  const {
    likedCount,
    cartCount,
    removeFromCart,
    refreshPurchases,
    purchasedLoading,
  } = useQAToolsState();

  const {
    products,
    total,
    loading,
  } = useCartProducts();

  const [acquiring, setAcquiring] = useState(false);
  const [acquisitionMessage, setAcquisitionMessage] = useState<string | null>(null);
  const [acquisitionError, setAcquisitionError] = useState<string | null>(null);
  const freeItems = products.filter(product => Number(product.price_eur) === 0).slice(0, 50);
  async function acquireFreeItems() {
    if (acquiring || loading || purchasedLoading || freeItems.length === 0) return;
    setAcquiring(true); setAcquisitionError(null); setAcquisitionMessage(null);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) throw new Error("Please log in to add free items to your account.");
      const response = await fetch("/api/account/acquire-free", {
        method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + data.session.access_token },
        body: JSON.stringify({ productIds: freeItems.map(product => product.id) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to acquire items.");
      for (const product of result.products as { slug: string }[]) removeFromCart(product.slug);
      refreshPurchases();
      setAcquisitionMessage("Free items added to your account. Refresh your Houdini license to include them.");
    } catch (reason) { setAcquisitionError(reason instanceof Error ? reason.message : "Unable to acquire items. Please try again."); }
    finally { setAcquiring(false); }
  }

  return (
    <div className="cart-page">
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
              <OutlineIcon kind="heart" />
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

      <main className="cart-page-main">
        <section className="cart-page-heading">
          <div>
            <span className="eyebrow">
              CART
            </span>

            <h1>
              Your cart
            </h1>
          </div>

          <span className="cart-page-count">
            {products.length}{" "}
            {products.length === 1
              ? "product"
              : "products"}
          </span>
        </section>

        <section className="cart-page-layout">
          <div className="cart-page-list-wrap">
            <div className="cart-page-columns">
              <span>ITEM</span>
              <span>DETAILS</span>
              <span>PRICE</span>
              <span />
            </div>

            {loading && (
              <div
                style={{
                  padding:
                    "50px 4px",
                  font:
                    "9px monospace",
                  color: "#555",
                }}
              >
                loading cart...
              </div>
            )}

            {!loading && (
              <div className="cart-page-list">
                {products.map(
                  (product) => {
                    const image =
                      getCartProductImage(
                        product
                      );

                    const category =
                      product.category
                        ?.name ?? "";

                    const complexity =
                      product.complexity
                        ?.name ?? "";

                    return (
                      <article
                        className="cart-page-item"
                        key={
                          product.id
                        }
                      >
                        <a
                          className="cart-page-item-main"
                          href={`/product?id=${product.slug}`}
                        >
                          {image ? (
                            <img
                              src={
                                image
                              }
                              alt={
                                product.name
                              }
                            />
                          ) : (
                            <div
                              style={{
                                width:
                                  "92px",
                                height:
                                  "70px",
                                border:
                                  "1px solid #222",
                                display:
                                  "grid",
                                placeItems:
                                  "center",
                                color:
                                  "#444",
                              }}
                            >
                              □
                            </div>
                          )}

                          <div className="cart-page-item-title">
                            <strong>
                              {
                                product.name
                              }
                            </strong>

                            <span>
                              {
                                product.subtitle
                              }
                            </span>
                          </div>
                        </a>

                        <div className="cart-page-item-details">
                          <div>
                            <span>
                              category
                            </span>

                            <strong>
                              {
                                category
                              }
                            </strong>
                          </div>

                          <div>
                            <span>
                              complexity
                            </span>

                            <strong>
                              {
                                complexity
                              }
                            </strong>
                          </div>
                        </div>

                        <div className="cart-page-item-price">
                          {formatCartPrice(
                            product.price_eur
                          )}
                        </div>

                        <button
                          className="cart-page-remove"
                          type="button"
                          onClick={() =>
                            removeFromCart(
                              product.slug
                            )
                          }
                        >
                          REMOVE
                        </button>
                      </article>
                    );
                  }
                )}
              </div>
            )}

            {!loading &&
              products.length ===
                0 && (
                <div className="cart-page-empty show">
                  <span>□</span>

                  <h2>
                    Your cart is empty
                  </h2>

                  <p>
                    Browse the
                    products page and
                    add an item to
                    continue.
                  </p>

                  <a href="/">
                    BROWSE PRODUCTS
                  </a>
                </div>
              )}
          </div>

          <aside className="cart-page-summary">
            <span className="eyebrow">
              SUMMARY
            </span>

            <div className="summary-row">
              <span>items</span>

              <strong>
                {products.length}
              </strong>
            </div>

            <div className="summary-row">
              <span>
                subtotal
              </span>

              <strong>
                {formatCartPrice(
                  total
                )}
              </strong>
            </div>

            <div className="summary-row muted-summary">
              <span>tax</span>

              <strong>
                included
              </strong>
            </div>

            <div className="summary-total">
              <span>total</span>

              <strong>
                {formatCartPrice(
                  total
                )}
              </strong>
            </div>

            {freeItems.length > 0 && <button
              className="cart-page-checkout"
              type="button"
              onClick={acquireFreeItems}
              disabled={loading || purchasedLoading || acquiring || freeItems.length === 0}
            >
              {acquiring ? "ADDING ITEMS..." : freeItems.length ? "GET FREE ITEMS" : "CHECKOUT"}
            </button>}

            {acquisitionError && <p role="alert" style={{ color: "#e86565", font: "10px monospace" }}>{acquisitionError} <a href="/user">Account</a></p>}
            {acquisitionMessage && <p role="status" style={{ color: "#55b86d", font: "10px monospace" }}>{acquisitionMessage} <a href="/user?section=purchased">Your items</a></p>}
            <SandboxCheckout products={products} disabled={loading || purchasedLoading || acquiring} />
            <div className="cart-page-notes">
              <div>
                <span>
                  account
                </span>

                <strong>
                  required
                </strong>
              </div>

              <div>
                <span>
                  license
                </span>

                <strong>
                  permanent
                </strong>
              </div>

              <div>
                <span>
                  downloads
                </span>

                <strong>
                  available after
                  purchase
                </strong>
              </div>
            </div>
          </aside>
        </section>
      </main>

      <footer>
        <span>
          qatools.studio
        </span>

        <span>cart</span>
      </footer>
    </div>
  );
}
