"use client";
import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";
import OutlineIcon from "@/components/OutlineIcon";
import AccountName from "@/components/AccountName";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { supabase } from "@/lib/supabase";
import { animateToCart } from "@/lib/cartAnimation";

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
  product_type: "tool" | "bundle" | "project";
  price_eur: number | string;
  release_date: string | null;

  category: {
    name: string;
  } | null;

  complexity: {
    name: string;
  } | null;

  product_media: ProductMedia[];
};

type LookupValue = {
  id: number;
  name: string;
  sort_order: number;
};

type FilterType =
  | "category"
  | "complexity"
  | "type";

type ActiveFilter = {
  type: FilterType;
  value: string;
};

type SortKey =
  | "popularity"
  | "price"
  | "complexity"
  | "relevance"
  | "date";

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
  popularity: "desc",
  price: "asc",
  complexity: "asc",
  relevance: "desc",
  date: "desc",
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

function getCardMedia(
  product: Product
) {
  const sortedMedia = [
    ...product.product_media,
  ].sort(
    (a, b) =>
      a.sort_order - b.sort_order
  );

  return (
    sortedMedia.find(
      (media) =>
        media.role === "card"
    ) ??
    sortedMedia.find(
      (media) =>
        media.role === "main"
    ) ??
    sortedMedia[0] ??
    null
  );
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

export default function Home() {
  const {
    likedCount,
    cartCount,
    isLiked,
    isInCart,
    isPurchased,
    toggleLike,
    toggleCart,
  } = useQAToolsState();

  const [products, setProducts] =
    useState<Product[]>([]);

  const [
    categories,
    setCategories,
  ] = useState<LookupValue[]>([]);

  const [
    complexities,
    setComplexities,
  ] = useState<LookupValue[]>([]);

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

  const [
    searchOpen,
    setSearchOpen,
  ] = useState(false);

  const [
    searchText,
    setSearchText,
  ] = useState("");

  const [
    activeSearch,
    setActiveSearch,
  ] = useState("");

  const [
    highlightedSuggestion,
    setHighlightedSuggestion,
  ] = useState(-1);

const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const filterAreaRef =
    useRef<HTMLDivElement>(null);

  const searchInputRef =
    useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadPage() {
      const [
        productsResult,
        categoriesResult,
        complexitiesResult,
      ] = await Promise.all([
        supabase
          .from("products")
          .select(`
            id,
            name,
            slug,
            subtitle,
            product_type,
            price_eur,
            release_date,
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
          `),

        supabase
          .from("category")
          .select(
            "id, name, sort_order"
          )
          .order("sort_order"),

        supabase
          .from("complexity")
          .select(
            "id, name, sort_order"
          )
          .order("sort_order"),
      ]);

      if (
        productsResult.error
      ) {
        setError(
          productsResult.error.message
        );

        setLoading(false);
        return;
      }

      if (
        categoriesResult.error
      ) {
        setError(
          categoriesResult.error
            .message
        );

        setLoading(false);
        return;
      }

      if (
        complexitiesResult.error
      ) {
        setError(
          complexitiesResult.error
            .message
        );

        setLoading(false);
        return;
      }

      setProducts(
        (productsResult.data ?? []).filter((p): p is typeof p & {price_eur:number} => p.price_eur !== null)
      );

      setCategories(
        categoriesResult.data ?? []
      );

      setComplexities(
        complexitiesResult.data ?? []
      );

      setLoading(false);
    }

    loadPage();
  }, []);

  useEffect(() => {
    if (!searchOpen) {
      return;
    }

    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  }, [searchOpen]);

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

  function openSearch() {
    setSearchOpen(true);

    closeMenus();

    setHighlightedSuggestion(
      -1
    );
  }

  function closeSearch() {
    setSearchOpen(false);

    setSearchText("");

    setHighlightedSuggestion(
      -1
    );
  }

  function applySearch() {
    const query =
      searchText.trim();

    if (!query) {
      return;
    }

    setActiveSearch(query);

    setSearchOpen(false);

    setHighlightedSuggestion(
      -1
    );

    window.scrollTo({
      top: 0,
      behavior: "auto",
    });
  }

  function clearSearch() {
    setActiveSearch("");
    setSearchText("");

    setHighlightedSuggestion(
      -1
    );
  }

  const searchSuggestions =
    useMemo(() => {
      const query =
        searchText
          .trim()
          .toLowerCase();

      if (!query) {
        return [];
      }

      return products
        .filter((product) =>
          product.name
            .toLowerCase()
            .includes(query)
        )
        .sort((a, b) => {
          const aName =
            a.name.toLowerCase();

          const bName =
            b.name.toLowerCase();

          const aStarts =
            aName.startsWith(
              query
            );

          const bStarts =
            bName.startsWith(
              query
            );

          if (
            aStarts &&
            !bStarts
          ) {
            return -1;
          }

          if (
            !aStarts &&
            bStarts
          ) {
            return 1;
          }

          return a.name.localeCompare(
            b.name
          );
        });
    }, [
      products,
      searchText,
    ]);

  function openSuggestion(
    product: Product
  ) {
    window.location.href =
      `/product?id=${product.slug}`;
  }

  function handleSearchKeyDown(
    event:
      React.KeyboardEvent<HTMLInputElement>
  ) {
    if (
      event.key ===
      "ArrowDown"
    ) {
      event.preventDefault();

      if (
        searchSuggestions.length ===
        0
      ) {
        return;
      }

      setHighlightedSuggestion(
        (current) => {
          if (
            current >=
            searchSuggestions.length -
              1
          ) {
            return 0;
          }

          return current + 1;
        }
      );

      return;
    }

    if (
      event.key === "ArrowUp"
    ) {
      event.preventDefault();

      if (
        searchSuggestions.length ===
        0
      ) {
        return;
      }

      setHighlightedSuggestion(
        (current) => {
          if (current <= 0) {
            return (
              searchSuggestions.length -
              1
            );
          }

          return current - 1;
        }
      );

      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();

      if (
        highlightedSuggestion >=
          0 &&
        searchSuggestions[
          highlightedSuggestion
        ]
      ) {
        openSuggestion(
          searchSuggestions[
            highlightedSuggestion
          ]
        );

        return;
      }

      applySearch();
    }

    if (
      event.key === "Escape"
    ) {
      closeSearch();
    }
  }

  const visibleProducts =
    useMemo(() => {
      let result =
        products.filter(
          (product) => {
            const category =
              product.category
                ?.name ?? "";

            const complexity =
              product.complexity
                ?.name ?? "";

            const passesFilters =
              activeFilters
                .length === 0 ||
              activeFilters.some(
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

            if (
              !passesFilters
            ) {
              return false;
            }

            if (
              !activeSearch
            ) {
              return true;
            }

            return product.name
              .toLowerCase()
              .includes(
                activeSearch
                  .toLowerCase()
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
            "popularity" ||
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
      activeSearch,
      activeSort,
    ]);

  return (
    <div
      className="products-page"
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

      <main>
        <section
          className="toolbar"
          id="products"
        >
          <div className="toolbar-left">

            {/* SORT */}

            <div className="menu-wrap">
              <button
                className="menu-trigger"
                id="sortTrigger"
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
                id="sortMenu"
                onClick={(
                  event
                ) =>
                  event.stopPropagation()
                }
              >
                {(
                  [
                    "popularity",
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

            <div
              className="active-sort-chips"
              id="activeSortChips"
            >
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
                  id="filterTrigger"
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
                  id="filterMenu"
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
                              category.name
                            )
                              ? "selected"
                              : ""
                          }`}
                          key={
                            category.id
                          }
                          type="button"
                          onClick={() =>
                            toggleFilter(
                              "category",
                              category.name
                            )
                          }
                        >
                          {category.name.toUpperCase()}
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
                              complexity.name
                            )
                              ? "selected"
                              : ""
                          }`}
                          key={
                            complexity.id
                          }
                          type="button"
                          onClick={() =>
                            toggleFilter(
                              "complexity",
                              complexity.name
                            )
                          }
                        >
                          {complexity.name.toUpperCase()}
                        </button>
                      )
                    )}
                  </div>

                  <div className="filter-note">
                    selected
                    filters combine
                    with OR
                  </div>

                  <button
                    className="clear-filters"
                    id="clearFilters"
                    type="button"
                    onClick={
                      clearFilters
                    }
                  >
                    clear all
                  </button>
                </div>
              </div>

              <div
                className="active-filter-chips"
                id="activeFilterChips"
              >
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

              <div
                className="active-search-chip"
                id="activeSearchChip"
              >
                {activeSearch && (
                  <button
                    className="filter-chip"
                    type="button"
                    onClick={(
                      event
                    ) => {
                      event.stopPropagation();

                      clearSearch();
                    }}
                  >
                    <span>
                      &quot;
                      {
                        activeSearch
                      }
                      &quot;
                    </span>

                    <b>×</b>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* SEARCH */}

          <div className="toolbar-right">
            <div
              className={`search-wrap ${
                searchOpen
                  ? "open"
                  : ""
              }`}
              id="searchWrap"
              onClick={(
                event
              ) =>
                event.stopPropagation()
              }
            >
              <button
                className="search-toggle"
                id="searchToggle"
                aria-label="Search"
                type="button"
                onClick={() => {
                  if (
                    searchOpen
                  ) {
                    searchInputRef.current?.focus();

                    return;
                  }

                  openSearch();
                }}
              >
                ⌕
              </button>

              <div
                className={`search-shell ${
                  searchOpen
                    ? "open"
                    : ""
                }`}
                id="searchShell"
              >
                <input
                  ref={
                    searchInputRef
                  }
                  id="searchInput"
                  type="text"
                  autoComplete="off"
                  placeholder="search products"
                  value={
                    searchText
                  }
                  onChange={(
                    event
                  ) => {
                    setSearchText(
                      event.target
                        .value
                    );

                    setHighlightedSuggestion(
                      -1
                    );
                  }}
                  onKeyDown={
                    handleSearchKeyDown
                  }
                />

                <button
                  className="search-close"
                  id="searchClose"
                  aria-label="Close search"
                  type="button"
                  onClick={
                    closeSearch
                  }
                >
                  ×
                </button>

                <div
                  className={`search-results ${
                    searchOpen &&
                    searchText.trim() &&
                    searchSuggestions.length >
                      0
                      ? "open"
                      : ""
                  }`}
                  id="searchResults"
                >
                  {searchSuggestions.map(
                    (
                      product,
                      index
                    ) => (
                      <button
                        key={
                          product.id
                        }
                        className={`search-result ${
                          highlightedSuggestion ===
                          index
                            ? "keyboard-active"
                            : ""
                        }`}
                        type="button"
                        onMouseEnter={() =>
                          setHighlightedSuggestion(
                            index
                          )
                        }
                        onClick={() =>
                          openSuggestion(
                            product
                          )
                        }
                      >
                        <span>
                          {
                            product.name
                          }
                        </span>

                        <small>
                          {
                            product.subtitle
                          }
                        </small>
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {loading && (
          <div
            style={{
              padding:
                "40px 26px",
              fontFamily:
                "monospace",
              color: "#777",
            }}
          >
            loading products...
          </div>
        )}

        {error && (
          <div
            style={{
              padding:
                "40px 26px",
              fontFamily:
                "monospace",
              color: "#e44747",
            }}
          >
            {error}
          </div>
        )}

        {!loading &&
          !error && (
            <section
              className="product-grid"
              id="productGrid"
            >
              {visibleProducts.map(
                (product) => {
                  const cardMedia =
                    getCardMedia(
                      product
                    );

                  const mediaUrl =
                    cardMedia
                      ? getMediaUrl(
                          cardMedia.file_path
                        )
                      : null;

                  const category =
                    product.category
                      ?.name ?? "";

                  const complexity =
                    product.complexity
                      ?.name ?? "";

                  const liked =
                    isLiked(
                      product.slug
                    );

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
                          {mediaUrl ? (
                            <img
                              src={
                                mediaUrl
                              }
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
                              className={`heart ${
                                liked
                                  ? "liked"
                                  : ""
                              }`}
                              aria-label={`Like ${product.name}`}
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
                              {formatPrice(
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

      <footer>
        <span>
          qatools.studio
        </span>

        <span>
          products
        </span>
      </footer>
    </div>
  );
}