"use client";
import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";
import OutlineIcon from "@/components/OutlineIcon";
import AccountName from "@/components/AccountName";

import { useQAToolsState } from "@/context/QAToolsState";

export default function InstallPage() {
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
          HOW TO INSTALL
        </span>

        <h1>
          Get your qatools
          running in Houdini.
        </h1>

        <p>
          These instructions cover the current Houdini 22 installer on Windows.
          Individual tools, bundles and projects use the same shared qatools package.
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
                Log in and open <a href="/user?section=purchased">Purchased products</a>.
                Download your tool, bundle or project, then extract the complete ZIP. For projects, extract the ZIP inside the project folder into a separate working folder, preserving its structure.
                Inside you will find qatools.json and a qatools folder.
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
                Install the complete package
              </h2>

              <p
                style={{
                  margin: 0,
                  color: "#777",
                  fontSize: "12px",
                  lineHeight: 1.75,
                }}
              >
                Save your work and close Houdini. Open your Houdini preferences
                packages folder, usually <code style={{ overflowWrap: "anywhere" }}>Documents\houdini22.0\packages</code>.
                Create the packages folder if it does not exist. Copy qatools.json
                and the complete qatools folder into it. When updating, merge the
                folders and replace matching files while keeping your other tools.
                Installing only the HDA does not install the shared licensing files.
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
                Restart Houdini and place one of your owned tools. In your website
                account, open <a href="/user?section=license">License</a>, reveal your
                activation key and copy it. In the tool&apos;s License tab, click
                License key activation, paste the key and click Activate.
                Keep your key private.
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
                Check that State is active in the tool&apos;s License tab.
                One account activation covers your owned tools, including tools in
                bundles. Newly placed owned tools use the same shared license.
                After acquiring another tool, connect to the internet and click
                Refresh to update your access.
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
              Your account allows one active computer. If you change computers,
              ask support to release the previous assignment before activating the
              new one. Clear local license removes the cached license on that
              computer; it does not release the account&apos;s machine assignment.
            </p>

            <p
              style={{
                margin: 0,
                color: "#777",
                fontSize: "12px",
                lineHeight: 1.8,
              }}
            >
              After activation, tools can work offline using the cached license.
              Connect and click Refresh when renewal is needed. If a tool does not
              appear, check that the full package is in your Houdini packages folder
              and restart Houdini. For a connection error, check your internet
              connection and use the latest downloaded installer.
            </p>
          </div>
        </section>
      </main>

      <footer>
        <span>
          qatools.org
        </span>

        <span>
          how to install
        </span>
      </footer>
    </div>
  );
}