"use client";

import {
  useEffect,
  useState,
} from "react";

import { usePathname } from "next/navigation";

import { useQAToolsState } from "@/context/QAToolsState";

import {
  formatCartPrice,
  getCartProductImage,
  useCartProducts,
} from "@/hooks/useCartProducts";

export default function CartMenu() {
  const pathname =
    usePathname();

  const {
    cartCount,
    removeFromCart,
  } = useQAToolsState();

  const {
    products,
    total,
    loading,
  } = useCartProducts();

  const [open, setOpen] =
    useState(false);

  /*
    This means every existing
    #cartButton automatically
    opens this menu.

    We therefore do NOT need to
    modify the main page or tool
    page again.
  */
  useEffect(() => {
    function handleClick(
      event: MouseEvent
    ) {
      const target =
        event.target as HTMLElement;

      const button =
        target.closest(
          "#cartButton"
        );

      if (!button) {
        return;
      }

      event.preventDefault();

      setOpen(
        (current) => !current
      );
    }

    document.addEventListener(
      "click",
      handleClick
    );

    return () => {
      document.removeEventListener(
        "click",
        handleClick
      );
    };
  }, []);

  /*
    Close the cart menu whenever
    navigation occurs.
  */
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isMainPage =
    pathname === "/";

  const top =
    isMainPage
      ? "130px"
      : "76px";

  return (
    <>
      <div
        className={`cart-overlay ${
          open ? "open" : ""
        }`}
        onClick={() =>
          setOpen(false)
        }
        style={{
          top,
        }}
      />

      <aside
        className={`cart-drawer ${
          open ? "open" : ""
        }`}
        aria-hidden={!open}
        style={{
          top,
          height: `calc(100vh - ${top})`,
        }}
      >
        <div className="cart-drawer-head">
          <div>
            <span className="eyebrow">
              CART
            </span>

            <strong>
              {cartCount}{" "}
              {cartCount === 1
                ? "product"
                : "products"}
            </strong>
          </div>

          <button
            aria-label="Close cart"
            type="button"
            onClick={() =>
              setOpen(false)
            }
          >
            ×
          </button>
        </div>

        <a
          className="check-cart-button cart-page-link"
          href="/cart"
          onClick={() =>
            setOpen(false)
          }
        >
          GO TO CART
        </a>

        {loading && (
          <div
            style={{
              padding: "24px 16px",
              color: "#555",
              font:
                "9px monospace",
            }}
          >
            loading cart...
          </div>
        )}

        {!loading &&
          products.length > 0 && (
            <div className="cart-items">
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
                    <div
                      className="cart-row"
                      key={
                        product.id
                      }
                    >
                      <a
                        href={`/product?id=${product.slug}`}
                        onClick={() =>
                          setOpen(
                            false
                          )
                        }
                      >
                        {image ? (
                          <img
                            src={image}
                            alt={
                              product.name
                            }
                          />
                        ) : (
                          <div
                            style={{
                              width:
                                "66px",
                              height:
                                "52px",
                              display:
                                "grid",
                              placeItems:
                                "center",
                              border:
                                "1px solid #222",
                              color:
                                "#444",
                            }}
                          >
                            □
                          </div>
                        )}
                      </a>

                      <a
                        className="cart-row-copy"
                        href={`/product?id=${product.slug}`}
                        onClick={() =>
                          setOpen(
                            false
                          )
                        }
                      >
                        <strong>
                          {
                            product.name
                          }
                        </strong>

                        <span>
                          {category}
                          {category &&
                          complexity
                            ? " · "
                            : ""}
                          {
                            complexity
                          }
                        </span>
                      </a>

                      <span className="cart-row-price">
                        {formatCartPrice(
                          product.price_eur
                        )}
                      </span>

                      <button
                        className="cart-remove"
                        type="button"
                        aria-label={`Remove ${product.name} from cart`}
                        onClick={() =>
                          removeFromCart(
                            product.slug
                          )
                        }
                      >
                        ×
                      </button>
                    </div>
                  );
                }
              )}
            </div>
          )}

        {!loading &&
          products.length ===
            0 && (
            <div className="cart-empty show">
              <span>□</span>

              <p>
                your cart is empty
              </p>
            </div>
          )}

        <div className="cart-summary">
          <div>
            <span>total</span>

            <strong>
              {formatCartPrice(
                total
              )}
            </strong>
          </div>

          <button
            className="checkout-button"
            type="button"
            disabled={
              products.length ===
              0
            }
          >
            CHECKOUT
          </button>
        </div>
      </aside>
    </>
  );
}