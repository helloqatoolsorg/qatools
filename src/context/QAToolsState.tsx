"use client";

import {
  createContext,
  useCallback,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

const LIKE_KEY = "qatools_likes";
const CART_KEY = "qatools_cart";

type QAToolsStateContextType = {
  likedItems: string[];
  cartItems: string[];
  purchasedItems: string[];

  likedCount: number;
  cartCount: number;
  purchasedCount: number;

  purchasedLoading: boolean;

  isLiked: (id: string) => boolean;
  isInCart: (id: string) => boolean;
  isPurchased: (id: string) => boolean;

  toggleLike: (id: string) => void;
  toggleCart: (id: string) => void;
  removeFromCart: (id: string) => void;
  refreshPurchases: () => void;
};

type EntitlementProduct = {
  slug: string;
};

type EntitlementRow = {
  products:
    | EntitlementProduct
    | EntitlementProduct[]
    | null;
};

const QAToolsStateContext =
  createContext<QAToolsStateContextType | null>(
    null
  );

function readStoredArray(
  key: string
) {
  try {
    const value =
      localStorage.getItem(
        key
      );

    if (!value) {
      return [];
    }

    const parsed =
      JSON.parse(value);

    if (
      !Array.isArray(parsed)
    ) {
      return [];
    }

    return parsed.filter(
      (
        item
      ): item is string =>
        typeof item ===
        "string"
    );
  } catch {
    return [];
  }
}

export function QAToolsStateProvider({
  children,
}: {
  children: ReactNode;
}) {
  const {
    user,
    loading: authLoading,
  } = useAuth();

  const [
    likedItems,
    setLikedItems,
  ] =
    useState<string[]>([]);

  const [
    cartItems,
    setCartItems,
  ] =
    useState<string[]>([]);

  const [
    purchasedItems,
    setPurchasedItems,
  ] =
    useState<string[]>([]);

  const [
    purchasedLoading,
    setPurchasedLoading,
  ] =
    useState(false);

  const [
    ready,
    setReady,
  ] =
    useState(false);

  /*
    --------------------------------------------------
    LOAD LOCAL LIKES + CART
    --------------------------------------------------
  */
  useEffect(() => {
    setLikedItems(
      readStoredArray(
        LIKE_KEY
      )
    );

    setCartItems(
      readStoredArray(
        CART_KEY
      )
    );

    setReady(true);
  }, []);

  /*
    --------------------------------------------------
    SAVE LIKES
    --------------------------------------------------
  */
  useEffect(() => {
    if (!ready) {
      return;
    }

    localStorage.setItem(
      LIKE_KEY,
      JSON.stringify(
        likedItems
      )
    );
  }, [
    likedItems,
    ready,
  ]);

  /*
    --------------------------------------------------
    SAVE CART
    --------------------------------------------------
  */
  useEffect(() => {
    if (!ready) {
      return;
    }

    localStorage.setItem(
      CART_KEY,
      JSON.stringify(
        cartItems
      )
    );
  }, [
    cartItems,
    ready,
  ]);

  /*
    --------------------------------------------------
    CROSS-TAB LOCAL STORAGE SYNC
    --------------------------------------------------
  */
  useEffect(() => {
    function handleStorage(
      event: StorageEvent
    ) {
      if (
        event.key ===
        LIKE_KEY
      ) {
        setLikedItems(
          readStoredArray(
            LIKE_KEY
          )
        );
      }

      if (
        event.key ===
        CART_KEY
      ) {
        setCartItems(
          readStoredArray(
            CART_KEY
          )
        );
      }
    }

    window.addEventListener(
      "storage",
      handleStorage
    );

    return () => {
      window.removeEventListener(
        "storage",
        handleStorage
      );
    };
  }, []);

  /*
    --------------------------------------------------
    LOAD REAL PURCHASED PRODUCTS
    --------------------------------------------------

    Purchased products do NOT come from localStorage.

    They come from active entitlement rows belonging
    to the currently logged-in Supabase user.

    RLS is still the real security boundary.
  */
  const [purchaseRevision, setPurchaseRevision] = useState(0);
  const refreshPurchases = useCallback(() => setPurchaseRevision(value => value + 1), []);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      setPurchasedItems(
        []
      );

      setPurchasedLoading(
        false
      );

      return;
    }

    const userId = user.id;

    let cancelled =
      false;

    async function loadPurchasedItems() {
      setPurchasedLoading(
        true
      );

      const {
        data,
        error,
      } =
        await supabase
          .from(
            "entitlements"
          )
          .select(`
            products!entitlements_product_id_fkey (
              slug
            )
          `)
          .eq(
            "user_id",
            userId
          )
          .eq(
            "status",
            "active"
          );

      if (cancelled) {
        return;
      }

      if (error) {
        console.error(
          "Failed to load purchased products:",
          error
        );

        setPurchasedItems(
          []
        );

        setPurchasedLoading(
          false
        );

        return;
      }

      const rows =
        (data ??
          []) as EntitlementRow[];

      const slugs =
        rows
          .flatMap(
            (row) => {
              if (
                !row.products
              ) {
                return [];
              }

              if (
                Array.isArray(
                  row.products
                )
              ) {
                return row.products
                  .map(
                    (
                      product
                    ) =>
                      product.slug
                  )
                  .filter(
                    Boolean
                  );
              }

              return [
                row.products
                  .slug,
              ];
            }
          )
          .filter(
            (
              slug
            ): slug is string =>
              typeof slug ===
                "string" &&
              slug.length > 0
          );

      const uniqueSlugs =
        Array.from(
          new Set(slugs)
        );

      setPurchasedItems(
        uniqueSlugs
      );

      /*
        ----------------------------------------------
        PURCHASED + CART ARE MUTUALLY EXCLUSIVE
        ----------------------------------------------

        If an item is now owned but was already
        sitting in the cart, remove it.
      */
      setCartItems(
        (current) =>
          current.filter(
            (item) =>
              !uniqueSlugs.includes(
                item
              )
          )
      );

      setPurchasedLoading(
        false
      );
    }

    loadPurchasedItems();

    return () => {
      cancelled = true;
    };
  }, [
    user,
    authLoading,
    purchaseRevision,
  ]);

  /*
    --------------------------------------------------
    STATE HELPERS
    --------------------------------------------------
  */
  function isLiked(
    id: string
  ) {
    return likedItems.includes(
      id
    );
  }

  function isInCart(
    id: string
  ) {
    return cartItems.includes(
      id
    );
  }

  function isPurchased(
    id: string
  ) {
    return purchasedItems.includes(
      id
    );
  }

  /*
    --------------------------------------------------
    LIKE
    --------------------------------------------------
  */
  function toggleLike(
    id: string
  ) {
    setLikedItems(
      (current) => {
        if (
          current.includes(
            id
          )
        ) {
          return current.filter(
            (item) =>
              item !== id
          );
        }

        return [
          ...current,
          id,
        ];
      }
    );
  }

  /*
    --------------------------------------------------
    CART
    --------------------------------------------------

    Purchased products cannot be added to the cart.
  */
  function toggleCart(
    id: string
  ) {
    if (
      purchasedItems.includes(
        id
      )
    ) {
      return;
    }

    setCartItems(
      (current) => {
        if (
          current.includes(
            id
          )
        ) {
          return current.filter(
            (item) =>
              item !== id
          );
        }

        return [
          ...current,
          id,
        ];
      }
    );
  }

  function removeFromCart(
    id: string
  ) {
    setCartItems(
      (current) =>
        current.filter(
          (item) =>
            item !== id
        )
    );
  }

  /*
    --------------------------------------------------
    SHARED CONTEXT VALUE
    --------------------------------------------------
  */
  const value =
    useMemo(
      () => ({
        likedItems,
        cartItems,
        purchasedItems,

        likedCount:
          likedItems.length,

        cartCount:
          cartItems.length,

        purchasedCount:
          purchasedItems.length,

        purchasedLoading,

        isLiked,
        isInCart,
        isPurchased,

        toggleLike,
        toggleCart,
        removeFromCart,
        refreshPurchases,
      }),
      [
        likedItems,
        cartItems,
        purchasedItems,
        purchasedLoading,
        refreshPurchases,
      ]
    );

  return (
    <QAToolsStateContext.Provider
      value={value}
    >
      {children}
    </QAToolsStateContext.Provider>
  );
}

export function useQAToolsState() {
  const context =
    useContext(
      QAToolsStateContext
    );

  if (!context) {
    throw new Error(
      "useQAToolsState must be used inside QAToolsStateProvider"
    );
  }

  return context;
}