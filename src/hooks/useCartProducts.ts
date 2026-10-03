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
  const { cartItems } =
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

  useEffect(() => {
    async function loadCart() {
      if (
        cartItems.length === 0
      ) {
        setProducts([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      const { data, error } =
        await supabase
          .from("products")
          .select(`
            id,
            name,
            slug,
            subtitle,
            price_eur,
            category (
              name
            ),
            complexity (
              name
            ),
            product_media (
              id,
              file_path,
              role,
              sort_order
            )
          `)
          .in("slug", cartItems);

      if (error) {
        console.error(
          "Could not load cart products:",
          error
        );

        setProducts([]);
        setLoading(false);
        return;
      }

      const loaded =
        data ?? [];

      /*
        Keep the same order as
        the shared cart state.
      */
      loaded.sort(
        (a, b) =>
          cartItems.indexOf(
            a.slug
          ) -
          cartItems.indexOf(
            b.slug
          )
      );

      setProducts(loaded);
      setLoading(false);
    }

    loadCart();
  }, [cartItems]);

  const total = useMemo(
    () =>
      products.reduce(
        (sum, product) =>
          sum +
          Number(
            product.price_eur
          ),
        0
      ),
    [products]
  );

  return {
    products,
    total,
    loading,
  };
}