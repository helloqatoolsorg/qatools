"use client";

import { useQAToolsState } from "@/context/QAToolsState";

export default function InstallPage() {
  const {
    likedCount,
    cartCount,
  } = useQAToolsState();

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

          <a
            className="active"
            href="/install"
          >
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

      <main className="standalone-page">
        <span className="eyebrow">
          HOW TO INSTALL
        </span>

        <h1>
          Get your qatools
          running in Houdini.
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

        <section
          style={{
            marginTop: "64px",
            borderTop:
              "1px solid #1c1c1c",
          }}
        >
          <article
            style={{
              display: "grid",
              gridTemplateColumns:
                "90px minmax(0, 1fr)",
              gap: "42px",
              padding:
                "34px 0",
              borderBottom:
                "1px solid #1c1c1c",
            }}
          >
            <span
              style={{
                color: "#555",
                font:
                  "9px monospace",
                letterSpacing:
                  ".12em",
              }}
            >
              01
            </span>

            <div
              style={{
                maxWidth: "680px",
              }}
            >
              <h2
                style={{
                  margin:
                    "0 0 12px",
                  font:
                    "400 20px monospace",
                }}
              >
                Download your tool
              </h2>

              <p
                style={{
                  margin: 0,
                  color: "#777",
                  fontSize: "12px",
                  lineHeight: 1.75,
                }}
              >
                Lorem ipsum dolor sit
                amet, consectetur
                adipiscing elit. Integer
                nec odio. Praesent
                libero. Sed cursus ante
                dapibus diam. Sed nisi.
              </p>
            </div>
          </article>

          <article
            style={{
              display: "grid",
              gridTemplateColumns:
                "90px minmax(0, 1fr)",
              gap: "42px",
              padding:
                "34px 0",
              borderBottom:
                "1px solid #1c1c1c",
            }}
          >
            <span
              style={{
                color: "#555",
                font:
                  "9px monospace",
                letterSpacing:
                  ".12em",
              }}
            >
              02
            </span>

            <div
              style={{
                maxWidth: "680px",
              }}
            >
              <h2
                style={{
                  margin:
                    "0 0 12px",
                  font:
                    "400 20px monospace",
                }}
              >
                Place it in Houdini
              </h2>

              <p
                style={{
                  margin: 0,
                  color: "#777",
                  fontSize: "12px",
                  lineHeight: 1.75,
                }}
              >
                Lorem ipsum dolor sit
                amet, consectetur
                adipiscing elit.
                Curabitur sodales ligula
                in libero. Sed dignissim
                lacinia nunc. Curabitur
                tortor.
              </p>
            </div>
          </article>

          <article
            style={{
              display: "grid",
              gridTemplateColumns:
                "90px minmax(0, 1fr)",
              gap: "42px",
              padding:
                "34px 0",
              borderBottom:
                "1px solid #1c1c1c",
            }}
          >
            <span
              style={{
                color: "#555",
                font:
                  "9px monospace",
                letterSpacing:
                  ".12em",
              }}
            >
              03
            </span>

            <div
              style={{
                maxWidth: "680px",
              }}
            >
              <h2
                style={{
                  margin:
                    "0 0 12px",
                  font:
                    "400 20px monospace",
                }}
              >
                Activate your license
              </h2>

              <p
                style={{
                  margin: 0,
                  color: "#777",
                  fontSize: "12px",
                  lineHeight: 1.75,
                }}
              >
                Lorem ipsum dolor sit
                amet, consectetur
                adipiscing elit.
                Vestibulum lacinia arcu
                eget nulla. Class aptent
                taciti sociosqu ad litora
                torquent.
              </p>
            </div>
          </article>

          <article
            style={{
              display: "grid",
              gridTemplateColumns:
                "90px minmax(0, 1fr)",
              gap: "42px",
              padding:
                "34px 0",
              borderBottom:
                "1px solid #1c1c1c",
            }}
          >
            <span
              style={{
                color: "#555",
                font:
                  "9px monospace",
                letterSpacing:
                  ".12em",
              }}
            >
              04
            </span>

            <div
              style={{
                maxWidth: "680px",
              }}
            >
              <h2
                style={{
                  margin:
                    "0 0 12px",
                  font:
                    "400 20px monospace",
                }}
              >
                Start using the tool
              </h2>

              <p
                style={{
                  margin: 0,
                  color: "#777",
                  fontSize: "12px",
                  lineHeight: 1.75,
                }}
              >
                Lorem ipsum dolor sit
                amet, consectetur
                adipiscing elit. Fusce
                nec tellus sed augue
                semper porta. Mauris
                massa. Vestibulum
                lacinia arcu eget nulla.
              </p>
            </div>
          </article>
        </section>

        <section
          style={{
            marginTop: "72px",
            display: "grid",
            gridTemplateColumns:
              "minmax(0, .7fr) minmax(0, 1.3fr)",
            gap: "60px",
            paddingTop: "44px",
            borderTop:
              "1px solid #1c1c1c",
          }}
        >
          <div>
            <span className="eyebrow">
              NOTES
            </span>

            <h2
              style={{
                margin:
                  "10px 0 0",
                font:
                  "400 24px monospace",
              }}
            >
              A few things to keep
              in mind.
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
              adipiscing elit. Duis
              sagittis ipsum. Praesent
              mauris. Fusce nec tellus
              sed augue semper porta.
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
              adipiscing elit. Nulla
              quis sem at nibh
              elementum imperdiet.
              Duis sagittis ipsum.
            </p>
          </div>
        </section>
      </main>

      <footer>
        <span>
          qatools.studio
        </span>

        <span>
          how to install
        </span>
      </footer>
    </div>
  );
}