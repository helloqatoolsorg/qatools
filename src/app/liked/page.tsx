"use client";
import SiteFooter from "@/components/SiteFooter";
import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";
import OutlineIcon from "@/components/OutlineIcon";
import AccountName from "@/components/AccountName";

import {
  useMemo,
  useRef,
  useState,
} from "react";

import {
  formatLikedPrice,
  getLikedProductImage,
  useLikedProducts,
} from "@/hooks/useLikedProducts";

import { animateToCart } from "@/lib/cartAnimation";

import { useQAToolsState } from "@/context/QAToolsState";

type FilterType =
  | "category"
  | "complexity"
  | "type";

type ActiveFilter = {
  type: FilterType;
  value: string;
};

type SortKey =
  | "price"
  | "complexity"
  | "date"
  | "relevance";

type SortDirection =
  | "asc"
  | "desc";

type ActiveSort = {
  key: SortKey;
  dir: SortDirection;
};

const sortDefaults: Record<
  SortKey,
  SortDirection
> = {
  price: "asc",
  complexity: "asc",
  date: "desc",
  relevance: "desc",
};

function complexityRank(
  value: string
) {
  const ranks: Record<
    string,
    number
  > = {
    easy: 1,
    medium: 2,
    difficult: 3,
    advanced: 4,
  };

  return (
    ranks[value.toLowerCase()] ??
    999
  );
}

export default function LikedPage() {
  const {
    likedCount,
    cartCount,
    isInCart,
    isPurchased,
    toggleLike,
    toggleCart,
  } = useQAToolsState();

  const {
    products,
    loading,
  } = useLikedProducts();

const [
    activeFilters,
    setActiveFilters,
  ] = useState<ActiveFilter[]>([]);

  const [
    activeSort,
    setActiveSort,
  ] =
    useState<ActiveSort | null>(
      null
    );

  const [
    filterMenuOpen,
    setFilterMenuOpen,
  ] = useState(false);

  const [
    sortMenuOpen,
    setSortMenuOpen,
  ] = useState(false);

  const filterAreaRef =
    useRef<HTMLDivElement>(null);

  const categories =
    useMemo(() => {
      return Array.from(
        new Set(
          products
            .map(
              (product) =>
                product.category
                  ?.name
            )
            .filter(
              (
                value
              ): value is string =>
                Boolean(value)
            )
        )
      ).sort();
    }, [products]);

  const complexities =
    useMemo(() => {
      return Array.from(
        new Set(
          products
            .map(
              (product) =>
                product.complexity
                  ?.name
            )
            .filter(
              (
                value
              ): value is string =>
                Boolean(value)
            )
        )
      ).sort(
        (a, b) =>
          complexityRank(a) -
          complexityRank(b)
      );
    }, [products]);

  function closeMenus() {
    setFilterMenuOpen(false);
    setSortMenuOpen(false);
  }

  function toggleFilterMenu() {
    setFilterMenuOpen(
      (current) => !current
    );

    setSortMenuOpen(false);
  }

  function toggleSortMenu() {
    setSortMenuOpen(
      (current) => !current
    );

    setFilterMenuOpen(false);
  }

  function isFilterActive(
    type: FilterType,
    value: string
  ) {
    return activeFilters.some(
      (filter) =>
        filter.type === type &&
        filter.value === value
    );
  }

  function toggleFilter(
    type: FilterType,
    value: string
  ) {
    setActiveFilters(
      (current) => {
        const exists =
          current.some(
            (filter) =>
              filter.type ===
                type &&
              filter.value ===
                value
          );

        if (exists) {
          return current.filter(
            (filter) =>
              !(
                filter.type ===
                  type &&
                filter.value ===
                  value
              )
          );
        }

        return [
          ...current,
          {
            type,
            value,
          },
        ];
      }
    );
  }

  function removeFilter(
    type: FilterType,
    value: string
  ) {
    setActiveFilters(
      (current) =>
        current.filter(
          (filter) =>
            !(
              filter.type ===
                type &&
              filter.value ===
                value
            )
        )
    );
  }

  function clearFilters() {
    setActiveFilters([]);
  }

  function setSingleFilter(
    type: FilterType,
    value: string
  ) {
    setActiveFilters([
      {
        type,
        value,
      },
    ]);

    window.scrollTo({
      top: 0,
      behavior: "auto",
    });
  }

  function selectSort(
    key: SortKey
  ) {
    setActiveSort(
      (current) => {
        if (
          current?.key === key
        ) {
          return {
            key,
            dir:
              current.dir ===
              "asc"
                ? "desc"
                : "asc",
          };
        }

        return {
          key,
          dir:
            sortDefaults[key],
        };
      }
    );

    setSortMenuOpen(false);
  }

  function toggleSortDirection() {
    setActiveSort(
      (current) => {
        if (!current) {
          return null;
        }

        return {
          ...current,
          dir:
            current.dir ===
            "asc"
              ? "desc"
              : "asc",
        };
      }
    );
  }

  const visibleProducts =
    useMemo(() => {
      let result =
        products.filter(
          (product) => {
            if (
              activeFilters.length ===
              0
            ) {
              return true;
            }

            const category =
              product.category
                ?.name ?? "";

            const complexity =
              product.complexity
                ?.name ?? "";

            return activeFilters.some(
              (filter) => {
                if (filter.type === "type") return filter.value === product.product_type;
                  if (
                  filter.type ===
                  "category"
                ) {
                  return (
                    filter.value ===
                    category
                  );
                }

                return (
                  filter.value ===
                  complexity
                );
              }
            );
          }
        );

      if (!activeSort) {
        return result;
      }

      const direction =
        activeSort.dir ===
        "asc"
          ? 1
          : -1;

      result = [
        ...result,
      ].sort((a, b) => {
        let comparison = 0;

        if (
          activeSort.key ===
          "price"
        ) {
          comparison =
            Number(
              a.price_eur
            ) -
            Number(
              b.price_eur
            );
        }

        if (
          activeSort.key ===
          "complexity"
        ) {
          comparison =
            complexityRank(
              a.complexity
                ?.name ?? ""
            ) -
            complexityRank(
              b.complexity
                ?.name ?? ""
            );
        }

        if (
          activeSort.key ===
          "date"
        ) {
          const aDate =
            a.release_date
              ? new Date(
                  a.release_date
                ).getTime()
              : 0;

          const bDate =
            b.release_date
              ? new Date(
                  b.release_date
                ).getTime()
              : 0;

          comparison =
            aDate - bDate;
        }

        if (
          activeSort.key ===
          "relevance"
        ) {
          comparison = 0;
        }

        if (
          comparison === 0
        ) {
          comparison =
            a.name.localeCompare(
              b.name
            );
        }

        return (
          comparison * direction
        );
      });

      return result;
    }, [
      products,
      activeFilters,
      activeSort,
    ]);

  return (
    <div
      className="products-page liked-page"
      onClickCapture={(
        event
      ) => {
        if (
          !filterMenuOpen
        ) {
          return;
        }

        const target =
          event.target as Node;

        if (
          filterAreaRef.current
            ?.contains(target)
        ) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        setFilterMenuOpen(
          false
        );
      }}
      onClick={closeMenus}
    >
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

      <main>
        <section className="toolbar">
          <div className="toolbar-left">

            {/* SORT */}

            <div className="menu-wrap">
              <button
                className="menu-trigger"
                type="button"
                onClick={(
                  event
                ) => {
                  event.stopPropagation();

                  toggleSortMenu();
                }}
              >
                sort{" "}
                <span>＋</span>
              </button>

              <div
                className={`dropdown sort-menu multi-sort-menu ${
                  sortMenuOpen
                    ? "open"
                    : ""
                }`}
                onClick={(
                  event
                ) =>
                  event.stopPropagation()
                }
              >
                {(
                  [
                    "price",
                    "complexity",
                    "relevance",
                    "date",
                  ] as SortKey[]
                ).map((key) => {
                  const selected =
                    activeSort
                      ?.key === key;

                  const direction =
                    selected
                      ? activeSort.dir
                      : sortDefaults[
                          key
                        ];

                  return (
                    <button
                      key={key}
                      className={`sort-option ${
                        selected
                          ? "selected"
                          : ""
                      }`}
                      type="button"
                      onClick={() =>
                        selectSort(
                          key
                        )
                      }
                    >
                      <span>
                        {key}
                      </span>

                      <b>
                        {direction ===
                        "asc"
                          ? "↑"
                          : "↓"}
                      </b>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="active-sort-chips">
              {activeSort && (
                <div className="sort-chip-group">
                  <button
                    className="sort-chip-direction"
                    type="button"
                    title="Change sorting direction"
                    onClick={(
                      event
                    ) => {
                      event.stopPropagation();

                      toggleSortDirection();
                    }}
                  >
                    {activeSort.dir ===
                    "asc"
                      ? "↑"
                      : "↓"}
                  </button>

                  <button
                    className="sort-chip-name"
                    type="button"
                    title="Remove sorting"
                    onClick={(
                      event
                    ) => {
                      event.stopPropagation();

                      setActiveSort(
                        null
                      );
                    }}
                  >
                    <span>
                      {
                        activeSort.key
                      }
                    </span>

                    <b>×</b>
                  </button>
                </div>
              )}
            </div>

            {/* FILTER */}

            <div className="filter-wrap">
              <div
                className="menu-wrap"
                ref={
                  filterAreaRef
                }
              >
                <button
                  className="menu-trigger"
                  type="button"
                  onClick={(
                    event
                  ) => {
                    event.stopPropagation();

                    toggleFilterMenu();
                  }}
                >
                  filter{" "}
                  <span>＋</span>
                </button>

                <div
                  className={`dropdown filter-menu ${
                    filterMenuOpen
                      ? "open"
                      : ""
                  }`}
                  onClick={(
                    event
                  ) =>
                    event.stopPropagation()
                  }
                >
                  <div className="filter-group"><div className="filter-label">TYPE</div>{["tool", "bundle", "project"].map(value => <button key={value} type="button" className={"filter-option " + (isFilterActive("type", value) ? "selected" : "")} onClick={() => toggleFilter("type", value)}>{value.toUpperCase()}</button>)}</div>
                  <div className="filter-group">
                    <div className="filter-label">
                      CATEGORY
                    </div>

                    {categories.map(
                      (
                        category
                      ) => (
                        <button
                          className={`filter-option ${
                            isFilterActive(
                              "category",
                              category
                            )
                              ? "selected"
                              : ""
                          }`}
                          key={
                            category
                          }
                          type="button"
                          onClick={() =>
                            toggleFilter(
                              "category",
                              category
                            )
                          }
                        >
                          {category.toUpperCase()}
                        </button>
                      )
                    )}
                  </div>

                  <div className="filter-group">
                    <div className="filter-label">
                      COMPLEXITY
                    </div>

                    {complexities.map(
                      (
                        complexity
                      ) => (
                        <button
                          className={`filter-option ${
                            isFilterActive(
                              "complexity",
                              complexity
                            )
                              ? "selected"
                              : ""
                          }`}
                          key={
                            complexity
                          }
                          type="button"
                          onClick={() =>
                            toggleFilter(
                              "complexity",
                              complexity
                            )
                          }
                        >
                          {complexity.toUpperCase()}
                        </button>
                      )
                    )}
                  </div>

                  <div className="filter-note">
                    selected filters
                    combine with OR
                  </div>

                  <button
                    className="clear-filters"
                    type="button"
                    onClick={
                      clearFilters
                    }
                  >
                    clear all
                  </button>
                </div>
              </div>

              <div className="active-filter-chips">
                {activeFilters.map(
                  (filter) => (
                    <button
                      className="filter-chip"
                      key={`${filter.type}-${filter.value}`}
                      type="button"
                      onClick={(
                        event
                      ) => {
                        event.stopPropagation();

                        removeFilter(
                          filter.type,
                          filter.value
                        );

                        window.scrollTo(
                          {
                            top: 0,
                            behavior:
                              "auto",
                          }
                        );
                      }}
                    >
                      <span>
                        {filter.value.toUpperCase()}
                      </span>

                      <b>×</b>
                    </button>
                  )
                )}
              </div>
            </div>
          </div>

          <div className="toolbar-right">
            <span className="toolbar-meta">
              liked products
            </span>
          </div>
        </section>

        {loading && (
          <div
            style={{
              padding:
                "40px 26px",
              color: "#777",
              fontFamily:
                "monospace",
            }}
          >
            loading liked products...
          </div>
        )}

        {!loading &&
          visibleProducts.length ===
            0 && (
            <div
              style={{
                padding:
                  "80px 26px",
                textAlign:
                  "center",
                fontFamily:
                  "monospace",
                color: "#666",
              }}
            >
              <p>
                {products.length ===
                0
                  ? "no liked products yet"
                  : "no liked products match these filters"}
              </p>

              {products.length ===
              0 ? (
                <a href="/">
                  browse products
                </a>
              ) : (
                <button
                  type="button"
                  className="clear-filters"
                  onClick={
                    clearFilters
                  }
                >
                  clear filters
                </button>
              )}
            </div>
          )}

        {!loading &&
          visibleProducts.length >
            0 && (
            <section className="product-grid">
              {visibleProducts.map(
                (product) => {
                  const image =
                    getLikedProductImage(
                      product
                    );

                  const category =
                    product.category
                      ?.name ?? "";

                  const complexity =
                    product.complexity
                      ?.name ?? "";

                  const inCart =
                    isInCart(
                      product.slug
                    );

                  const purchased =
                    isPurchased(
                      product.slug
                    );

                  return (
                    <article
                      className="product-card"
                      key={
                        product.id
                      }
                      data-id={
                        product.slug
                      }
                      data-category={category.toUpperCase()}
                      data-complexity={complexity.toUpperCase()}
                      data-price={
                        product.price_eur
                      }
                      data-date={
                        product.release_date ??
                        ""
                      }
                    >
                      <a
                        className="card-open"
                        href={`/product?id=${product.slug}`}
                      >
                        <div className="media-frame">
                          {image ? (
                            <img
                              src={image}
                              alt={`${product.name} preview`}
                            />
                          ) : (
                            <div
                              style={{
                                width:
                                  "100%",
                                height:
                                  "100%",
                                display:
                                  "grid",
                                placeItems:
                                  "center",
                                color:
                                  "#555",
                                fontFamily:
                                  "monospace",
                              }}
                            >
                              no media
                            </div>
                          )}
                        </div>
                      </a>

                      <div className="card-copy">
                        <div className="card-info">
                        <div className="title-line">
                          <h2>
                            <a
                              href={`/product?id=${product.slug}`}
                            >
                              {
                                product.name
                              }
                            </a>
                          </h2>

                          <div className="state-icons">
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
                              className="heart liked"
                              type="button"
                              aria-label={`Unlike ${product.name}`}
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

                        <p>
                          {
                            product.subtitle
                          }
                        </p>

                        <div className="card-footer">
                          <div className="tags">
                            {category && (
                              <button
                                className="card-tag"
                                type="button"
                                onClick={() =>
                                  setSingleFilter(
                                    "category",
                                    category
                                  )
                                }
                              >
                                {category.toUpperCase()}
                              </button>
                            )}

                            {complexity && (
                              <button
                                className="card-tag"
                                type="button"
                                onClick={() =>
                                  setSingleFilter(
                                    "complexity",
                                    complexity
                                  )
                                }
                              >
                                {complexity.toUpperCase()}
                              </button>
                            )}
                          </div>

                          <div className="price-date">
                            <strong>
                              {formatLikedPrice(
                                product.price_eur
                              )}
                            </strong>
                          </div>
                        </div>

                        </div>

                        <button
                          className={`card-add-cart ${purchased ? "purchased" : ""} ${
                            inCart
                              ? "in-cart"
                              : ""
                          }`}
                          type="button"
                          disabled={purchased}
                          onClick={(
                            event
                          ) => {
                            if (purchased) {
                              return;
                            }

                            if (
                              !inCart
                            ) {
                              const card =
                                event.currentTarget.closest(
                                  ".product-card"
                                );

                              const image =
                                card?.querySelector(
                                  ".media-frame img"
                                ) as
                                  | HTMLImageElement
                                  | null;

                              animateToCart(
                                image
                              );
                            }

                            toggleCart(
                              product.slug
                            );
                          }}
                        >
                          {purchased
                            ? "PURCHASED"
                            : !inCart
                              ? "ADD TO CART"
                              : "IN CART"}
                        </button>
                      </div>
                    </article>
                  );
                }
              )}
            </section>
          )}
      </main>

      <SiteFooter>liked products</SiteFooter>
    </div>
  );
}