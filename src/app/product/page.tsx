"use client";
import SiteFooter from "@/components/SiteFooter";
import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";
import OutlineIcon from "@/components/OutlineIcon";
import IncludedTools from "@/components/IncludedTools";
import ProjectDetails from "@/components/ProjectDetails";
import ProductGallery from "@/components/ProductGallery";
import ProductDownload from "@/components/ProductDownload";
import {useProductReleases} from "@/hooks/useProductReleases";
import "./releases.css";
import ProductDescription from "@/components/ProductDescription";
import {productKind, productKindLabel} from "@/lib/productKind";
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
  product_type: string;
  prepared_identity?: unknown;
  compatibility: string;
  current_version: string;
  release_date: string | null;
  initial_release_date?: string | null;
  last_release_update_at?: string | null;
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
    return `${value}€`;
  }

  return `${value.toFixed(2)}€`;
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
        params.get("id") ?? params.get("slug");

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
          *,
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
        .eq("published", true)
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

  const releaseState=useProductReleases(product?.id ?? null);
  const selectedRelease=releaseState.selectedRelease;
  const releaseCompatibility=selectedRelease?.compatibility ?? product?.compatibility ?? "";
  const releaseDate=selectedRelease?.published_at.slice(0,10) ?? product?.release_date;

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
            <Link
              className="active"
              href="/"
            >
              products
            </Link>

            <a href="/install">
              how to install
            </a>

            <a href="/whats-new">
              what&apos;s new
            </a>
          </nav>
        </header>

        <main className="product-page">
          <Link
            className="back-link"
            href="/"
          >
            ← products
          </Link>

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

  const galleryImages = (mainMedia
    ? [mainMedia, ...sortedMedia.filter((media) => media.id !== mainMedia.id && (media.role === "detail" || media.role === "gallery"))]
    : []).flatMap((media) => {
      const src = getMediaUrl(media.file_path);
      return src ? [{ id: media.id, src }] : [];
    });
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
          <Link
            className="active"
            href="/"
          >
            products
          </Link>

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
        <Link
          className="back-link"
          href="/"
        >
          ← products
        </Link>

        <section className="product-hero">
          <ProductGallery key={product.id} images={galleryImages} name={product.name}
            releasedAt={product.initial_release_date ?? product.release_date} updatedAt={product.last_release_update_at} />

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

            <ProductDescription text={product.description} />

            <div className="product-meta">
              <Link className="meta-filter" href={"/?type=" + productKind(product)}>{productKindLabel(product).toUpperCase()}</Link>
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
            {product.product_type === "project" && <ProjectDetails key={product.id} productId={product.id} release={selectedRelease ? selectedRelease.project ?? null : undefined} />}
            <div className="buy-row">
              <strong>
                {formatPrice(
                  product.price_eur
                )}
              </strong>

              <div className="tool-purchase-actions">
              {(product.product_type === "tool" || product.product_type === "bundle" || purchased) && <ProductDownload key={product.id} productId={product.id} releaseId={selectedRelease?.id} label={purchased ? "DOWNLOAD" : Number(product.price_eur) === 0 ? "FREE DOWNLOAD" : "TRY FOR FREE"} buttonClassName="buy-button try-button"/>}
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
            </div>

            <div className="micro-info">
              <div>
                <span>
                  compatibility
                </span>

                <strong className="product-compatibility">
                  {/^Houdini \d+ and newer$/i.test(releaseCompatibility) ? (
                    <><b>{releaseCompatibility.slice(0, -" and newer".length)}</b>{" "}<em>and newer</em></>
                  ) : releaseCompatibility}
                </strong>
              </div>

              <div>
                <span>
                  version
                </span>

                {releaseState.releases.length ? <select className="product-release-select" aria-label="Download version" value={selectedRelease?.id ?? ""} onChange={e=>releaseState.selectRelease(e.target.value)}>
                  {releaseState.releases.map(release=><option key={release.id} value={release.id}>v{release.version}{release.latest ? " · Latest" : ""}</option>)}
                </select> : <strong>v{product.current_version.replace(/^v/i,"")}</strong>}
              </div>

              {releaseDate && (
                <div>
                  <span>
                    release date
                  </span>

                  <strong>
                    {
                      releaseDate
                    }
                  </strong>
                </div>
              )}
            </div>

            {releaseState.error && <p className="product-release-message" role="status">{releaseState.error}</p>}
            {selectedRelease?.notes && <p className="product-release-notes">{selectedRelease.notes}</p>}

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

      </main>

      <SiteFooter>{product.name} /{" "}
          {category} /{" "}
          {complexity}</SiteFooter>
    </>
  );
}
