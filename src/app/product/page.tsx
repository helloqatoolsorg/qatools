"use client";
import SiteFooter from "@/components/SiteFooter";
import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";
import OutlineIcon from "@/components/OutlineIcon";
import IncludedTools from "@/components/IncludedTools";
import AccountName from "@/components/AccountName";
import { animateToCart } from "@/lib/cartAnimation";

import {
  useEffect,
  useState,
} from "react";

import { supabase } from "@/lib/supabase";
import { useQAToolsState } from "@/context/QAToolsState";

type ProductMedia = {
  id: number;
  media_type: string;
  file_path: string | null;
  external_url: string | null;
  role: string;
  sort_order: number;
};

type Product = {
  id: number;
  name: string;
  slug: string;
  subtitle: string;
  description: string;
  price_eur: number | string;
  compatibility: string;
  current_version: string;
  release_date: string | null;
  also_included_in_text:
    | string
    | null;

  category: {
    name: string;
  } | null;

  complexity: {
    name: string;
  } | null;

  product_media: ProductMedia[];
};

function getMediaUrl(
  filePath: string | null
) {
  if (!filePath) {
    return null;
  }

  const { data } = supabase.storage
    .from("product-media")
    .getPublicUrl(filePath);

  return data.publicUrl;
}

function formatPrice(
  price: number | string
) {
  const value = Number(price);

  if (Number.isInteger(value)) {
    return `€${value}`;
  }

  return `€${value.toFixed(2)}`;
}

export default function ProductPage() {
  const {
    likedCount,
    cartCount,
    isLiked,
    isInCart,
    isPurchased,
    toggleLike,
    toggleCart,
  } = useQAToolsState();

  const [
    product,
    setProduct,
  ] =
    useState<Product | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null
    );

  useEffect(() => {
    async function loadProduct() {
      const params =
        new URLSearchParams(
          window.location.search
        );

      const slug =
        params.get("id");

      if (!slug) {
        setError(
          "Product not found."
        );

        setLoading(false);

        return;
      }

      const {
        data,
        error:
          productError,
      } = await supabase
        .from("products")
        .select(`
          id,
          name,
          slug,
          subtitle,
          description,
          price_eur,
          compatibility,
          current_version,
          release_date,
          also_included_in_text,
          category (
            name
          ),
          complexity (
            name
          ),
          product_media (
            id,
            media_type,
            file_path,
            external_url,
            role,
            sort_order
          )
        `)
        .eq("slug", slug)
        .single();

      if (
        productError ||
        !data || data.price_eur === null
      ) {
        setError(
          "Product not found."
        );

        setLoading(false);

        return;
      }

      setProduct(
        {...data,price_eur:data.price_eur}
      );

      setLoading(false);
    }

    loadProduct();
  }, []);

  if (loading) {
    return (
      <main
        style={{
          padding: "40px 26px",
          fontFamily:
            "monospace",
          color: "#777",
        }}
      >
        loading product...
      </main>
    );
  }

  if (
    error ||
    !product
  ) {
    return (
      <>
        <header className="site-header">
          <Link
            className="brand"
            href="/"
          >
            <BrandLogo />
          </Link>

          <nav className="main-nav">
            <a
              className="active"
              href="/"
            >
              products
            </a>

            <a href="/install">
              how to install
            </a>

            <a href="/whats-new">
              what&apos;s new
            </a>
          </nav>
        </header>

        <main className="product-page">
          <a
            className="back-link"
            href="/"
          >
            ← products
          </a>

          <p>
            Product not found.
          </p>
        </main>
      </>
    );
  }

  const sortedMedia = [
    ...product.product_media,
  ].sort(
    (a, b) =>
      a.sort_order -
      b.sort_order
  );

  const mainMedia =
    sortedMedia.find(
      (media) =>
        media.role === "main"
    ) ??
    sortedMedia.find(
      (media) =>
        media.role === "card"
    ) ??
    sortedMedia[0] ??
    null;

  const detailMedia =
    sortedMedia.filter(
      (media) =>
        media.role ===
          "detail" ||
        media.role ===
          "gallery"
    );

  const mainMediaUrl =
    mainMedia
      ? getMediaUrl(
          mainMedia.file_path
        )
      : null;

  const category =
    product.category?.name ?? "";

  const complexity =
    product.complexity
      ?.name ?? "";

  const liked =
    isLiked(product.slug);

  const inCart =
    isInCart(product.slug);

  const purchased =
    isPurchased(product.slug);

  return (
    <>
      <header className="site-header">
        <Link
          className="brand"
          href="/"
        >
            <BrandLogo />
          </Link>

        <nav className="main-nav">
          <a
            className="active"
            href="/"
          >
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

            <span
              id="cartCount"
              className="cart-count"
            >
              {cartCount > 0
                ? cartCount
                : ""}
            </span>
          </button>
        </nav>
      </header>

      <main className="product-page">
        <a
          className="back-link"
          href="/"
        >
          ← products
        </a>

        <section className="product-hero">
          <div className="product-media">
            {mainMediaUrl ? (
              <img
                id="productImage"
                src={mainMediaUrl}
                alt={`${product.name} preview`}
              />
            ) : (
              <div
                style={{
                  minHeight:
                    "570px",
                  display:
                    "grid",
                  placeItems:
                    "center",
                  color: "#555",
                  fontFamily:
                    "monospace",
                }}
              >
                no media
              </div>
            )}
          </div>

          <aside className="product-info">
            <div className="product-heading">
              <div>
                <h1>
                  {product.name}
                </h1>

                <p className="subtitle">
                  {product.subtitle}
                </p>
              </div>

              <div className="tool-state-icons">
                {purchased && (
                  <span
                    className="purchase-state show"
                    title="Purchased"
                  >
                    ✓
                  </span>
                )}

                <span
                  className={`cart-state ${
                    inCart
                      ? "show"
                      : ""
                  }`}
                  title="In cart"
                >
                  <OutlineIcon kind="cart" />
                </span>

                <button
                  id="toolHeart"
                  className={`hero-heart ${
                    liked
                      ? "liked"
                      : ""
                  }`}
                  aria-label="Like this item"
                  type="button"
                  onClick={() =>
                    toggleLike(
                      product.slug
                    )
                  }
                >
                  <OutlineIcon kind="heart" />
                </button>
              </div>
            </div>

            <p className="description">
              {product.description}
            </p>

            <div className="product-meta">
              {category && (
                <a
                  className="meta-filter"
                  href={`/?filter=${encodeURIComponent(
                    category
                  )}`}
                >
                  {category.toUpperCase()}
                </a>
              )}

              {complexity && (
                <a
                  className="meta-filter"
                  href={`/?filter=${encodeURIComponent(
                    complexity
                  )}`}
                >
                  {complexity.toUpperCase()}
                </a>
              )}
            </div>

            <IncludedTools key={product.id} productId={product.id}/>
            <div className="buy-row">
              <strong>
                {formatPrice(
                  product.price_eur
                )}
              </strong>

              <button
                id="toolAddToCart"
                className={`buy-button ${purchased ? "purchased" : ""} ${
                  inCart
                    ? "in-cart"
                    : ""
                }`}
                type="button"
                disabled={purchased}
                onClick={() => {
                  if (purchased) {
                    return;
                  }

                  if (!inCart) {
                    animateToCart(
                      document.getElementById(
                        "productImage"
                      ) as HTMLImageElement | null
                    );
                  }

                  toggleCart(
                    product.slug
                  );
                }}
              >
                {purchased
                  ? "PURCHASED"
                  : inCart
                    ? "IN CART"
                    : "ADD TO CART"}
              </button>
            </div>

            <div className="micro-info">
              <div>
                <span>
                  compatibility
                </span>

                <strong>
                  {
                    product.compatibility
                  }
                </strong>
              </div>

              <div>
                <span>
                  version
                </span>

                <strong>
                  {
                    product.current_version
                  }
                </strong>
              </div>

              {product.release_date && (
                <div>
                  <span>
                    release date
                  </span>

                  <strong>
                    {
                      product.release_date
                    }
                  </strong>
                </div>
              )}
            </div>

            {product.also_included_in_text && (
              <div
                style={{
                  marginTop:
                    "22px",
                  color: "#666",
                  font:
                    "9px monospace",
                }}
              >
                also included in{" "}
                <span
                  style={{
                    color:
                      "#999",
                  }}
                >
                  {
                    product.also_included_in_text
                  }
                </span>
              </div>
            )}
          </aside>
        </section>

        {detailMedia.length >
          0 && (
          <section className="complex-description show">
            <div className="complex-copy">
              <span className="eyebrow">
                DETAILED DESCRIPTION
              </span>

              <p>
                {
                  product.description
                }
              </p>
            </div>

            <div className="secondary-media">
              {detailMedia.map(
                (media) => {
                  const url =
                    getMediaUrl(
                      media.file_path
                    );

                  if (!url) {
                    return null;
                  }

                  return (
                    <img
                      key={
                        media.id
                      }
                      src={url}
                      alt={`${product.name} detail`}
                    />
                  );
                }
              )}
            </div>
          </section>
        )}
      </main>

      <SiteFooter>{product.name} /{" "}
          {category} /{" "}
          {complexity}</SiteFooter>
    </>
  );
}