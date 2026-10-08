"use client";
import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";
import OutlineIcon from "@/components/OutlineIcon";
import AccountName from "@/components/AccountName";

import { useQAToolsState } from "@/context/QAToolsState";

export default function WhatsNewPage() {
  const {
    likedCount,
    cartCount,
  } = useQAToolsState();

  return (
    <div className="content-page">
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

          <a
            className="active"
            href="/whats-new"
          >
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

      <main className="standalone-page">
        <span className="eyebrow">
          WHAT&apos;S NEW
        </span>

        <h1>
          New tools, updates
          and improvements.
        </h1>

        <p>
          Lorem ipsum dolor sit amet,
          consectetur adipiscing elit.
          Sed do eiusmod tempor
          incididunt ut labore et dolore
          magna aliqua. Ut enim ad minim
          veniam, quis nostrud
          exercitation ullamco laboris.
        </p>

        <section className="news-list">
          <article className="news-entry">
            <span>
              2026.10.01
            </span>

            <strong>
              <a
                href="/product?id=qafit01"
                style={{
                  color: "inherit",
                  textDecoration: "none",
                }}
              >
                qafit01
              </a>
            </strong>

            <span>
              Lorem ipsum dolor sit
              amet, consectetur
              adipiscing elit. Integer
              nec odio. Praesent libero
              sed cursus ante.
            </span>

            <span>
              NEW
            </span>
          </article>

          <article className="news-entry">
            <span>
              2026.09.28
            </span>

            <strong>
              <a
                href="/product?id=qavellum01"
                style={{
                  color: "inherit",
                  textDecoration: "none",
                }}
              >
                qavellum01
              </a>
            </strong>

            <span>
              Lorem ipsum dolor sit
              amet, consectetur
              adipiscing elit.
              Curabitur sodales ligula
              in libero.
            </span>

            <span>
              UPDATE
            </span>
          </article>

          <article className="news-entry">
            <span>
              2026.09.24
            </span>

            <strong>
              <a
                href="/product?id=qasim01"
                style={{
                  color: "inherit",
                  textDecoration: "none",
                }}
              >
                qasim01
              </a>
            </strong>

            <span>
              Lorem ipsum dolor sit
              amet, consectetur
              adipiscing elit. Sed
              dignissim lacinia nunc.
            </span>

            <span>
              NEW
            </span>
          </article>

          <article className="news-entry">
            <span>
              2026.09.18
            </span>

            <strong>
              qatools
            </strong>

            <span>
              Lorem ipsum dolor sit
              amet, consectetur
              adipiscing elit.
              Vestibulum lacinia arcu
              eget nulla.
            </span>

            <span>
              SITE
            </span>
          </article>

          <article className="news-entry">
            <span>
              2026.09.12
            </span>

            <strong>
              <a
                href="/product?id=qafit01"
                style={{
                  color: "inherit",
                  textDecoration: "none",
                }}
              >
                qafit01
              </a>
            </strong>

            <span>
              Lorem ipsum dolor sit
              amet, consectetur
              adipiscing elit. Fusce
              nec tellus sed augue
              semper porta.
            </span>

            <span>
              UPDATE
            </span>
          </article>
        </section>

        <section
          style={{
            marginTop: "90px",
            paddingTop: "48px",
            borderTop:
              "1px solid #1c1c1c",
            display: "grid",
            gridTemplateColumns:
              "minmax(0, .7fr) minmax(0, 1.3fr)",
            gap: "60px",
          }}
        >
          <div>
            <span className="eyebrow">
              DEVELOPMENT
            </span>

            <h2
              style={{
                margin:
                  "10px 0 0",
                font:
                  "400 24px monospace",
              }}
            >
              More is on the way.
            </h2>
          </div>

          <div>
            <p
              style={{
                margin:
                  "0 0 24px",
                color: "#777",
                fontSize: "12px",
                lineHeight: 1.8,
              }}
            >
              Lorem ipsum dolor sit
              amet, consectetur
              adipiscing elit. Nulla
              quis sem at nibh
              elementum imperdiet.
              Duis sagittis ipsum.
            </p>

            <p
              style={{
                margin: 0,
                color: "#777",
                fontSize: "12px",
                lineHeight: 1.8,
              }}
            >
              Lorem ipsum dolor sit
              amet, consectetur
              adipiscing elit. Class
              aptent taciti sociosqu ad
              litora torquent per
              conubia nostra.
            </p>
          </div>
        </section>
      </main>

      <footer>
        <span>
          qatools.studio
        </span>

        <span>
          what&apos;s new
        </span>
      </footer>
    </div>
  );
}