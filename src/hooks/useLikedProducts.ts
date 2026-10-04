"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import { useQAToolsState } from "@/context/QAToolsState";

export type LikedProductMedia = {
  id: number;
  file_path: string | null;
  role: string;
  sort_order: number;
};

export type LikedProduct = {
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

  product_media: LikedProductMedia[];
};

export function getLikedMediaUrl(
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

export function getLikedProductImage(
  product: LikedProduct
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
    ? getLikedMediaUrl(
        selected.file_path
      )
    : null;
}

export function formatLikedPrice(
  value: number | string
) {
  const price = Number(value);

  if (Number.isInteger(price)) {
    return `€${price}`;
  }

  return `€${price.toFixed(2)}`;
}

export function useLikedProducts() {
  const { likedItems } =
    useQAToolsState();

  const [
    products,
    setProducts,
  ] =
    useState<LikedProduct[]>([]);

  const [
    loading,
    setLoading,
  ] = useState(false);

  useEffect(() => {
    async function loadLiked() {
      if (
        likedItems.length === 0
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
              file_path,
              role,
              sort_order
            )
          `)
          .in("slug", likedItems);

      if (error) {
        console.error(
          "Could not load liked products:",
          error
        );

        setProducts([]);
        setLoading(false);
        return;
      }

      const loaded =
        data ?? [];

      loaded.sort(
        (a, b) =>
          likedItems.indexOf(
            a.slug
          ) -
          likedItems.indexOf(
            b.slug
          )
      );

      setProducts(loaded);
      setLoading(false);
    }

    loadLiked();
  }, [likedItems]);

  return {
    products,
    loading,
  };
}