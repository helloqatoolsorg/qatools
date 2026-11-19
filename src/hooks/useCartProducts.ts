"use client";

import { useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";
import { useQAToolsState } from "@/context/QAToolsState";

export type CartProductMedia = {
  id: number;
  file_path: string | null;
  role: string;
  sort_order: number;
};

export type CartProduct = {
  id: number;
  name: string;
  slug: string;
  subtitle: string;
  price_eur: number | string;

  category: {
    name: string;
  } | null;

  complexity: {
    name: string;
  } | null;

  product_media: CartProductMedia[];
};

export function getCartMediaUrl(
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

export function getCartProductImage(
  product: CartProduct
) {
  const media = [
    ...product.product_media,
  ].sort(
    (a, b) =>
      a.sort_order - b.sort_order
  );

  const selected =
    media.find(
      (item) =>
        item.role === "card"
    ) ??
    media.find(
      (item) =>
        item.role === "main"
    ) ??
    media[0] ??
    null;

  return selected
    ? getCartMediaUrl(
        selected.file_path
      )
    : null;
}

export function formatCartPrice(
  value: number | string
) {
  const price = Number(value);

  if (Number.isInteger(price)) {
    return `€${price}`;
  }

  return `€${price.toFixed(2)}`;
}

export function useCartProducts() {
  const { cartItems, reconcileCart } =
    useQAToolsState();

  const [
    products,
    setProducts,
  ] =
    useState<CartProduct[]>([]);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [refreshRevision, setRefreshRevision] = useState(0);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "hidden") setRefreshRevision(value => value + 1);
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadCart() {
      if (cartItems.length === 0) {
        setProducts([]); setLoading(false); setError(null);
        return;
      }
      setLoading(true); setError(null);
      try {
        const {data, error: queryError, count} = await supabase.from("products")
          .select("id,name,slug,subtitle,price_eur,category(name),complexity(name),product_media(id,file_path,role,sort_order)", {count:"exact"})
          .in("slug", cartItems).eq("published", true);
        if (cancelled) return;
        if (queryError || !data || count !== data.length) throw new Error("Cart lookup failed");
        const loaded = data.filter((p): p is typeof p & {price_eur:number} => p.price_eur !== null);
        loaded.sort((a,b) => cartItems.indexOf(a.slug) - cartItems.indexOf(b.slug));
        setProducts(loaded);
        reconcileCart(cartItems, loaded.map(product => product.slug));
      } catch {
        if (!cancelled) setError("Unable to load your cart. Refresh to try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadCart();
    return () => { cancelled = true; };
  }, [cartItems, reconcileCart, refreshRevision]);

  const visibleProducts = useMemo(() => products.filter(product => cartItems.includes(product.slug)), [products, cartItems]);

  const total = useMemo(
    () =>
      visibleProducts.reduce(
        (sum, product) =>
          sum +
          Number(
            product.price_eur
          ),
        0
      ),
    [visibleProducts]
  );

  return {
    products: visibleProducts,
    total,
    loading,
    error,
  };
}