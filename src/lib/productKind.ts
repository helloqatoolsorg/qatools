// Display distinctions only. Shelf tools retain product_type='tool' for commerce/licensing.
export const catalogProductTypes = ["tool", "shelf_tool", "bundle", "project"] as const;
export type CatalogProductType = typeof catalogProductTypes[number];
export const productKindLabels: Record<CatalogProductType, string> = {
  tool: "Tool", shelf_tool: "Shelf Tool", bundle: "Bundle", project: "Project",
};
type ProductKindSource = { product_type?: string; prepared_identity?: unknown; tool_kind?: string | null };
export function productKind(product: ProductKindSource | null | undefined): CatalogProductType {
  if (product?.product_type === "bundle" || product?.product_type === "project") return product.product_type;
  const identity = product?.prepared_identity;
  return product?.product_type === "tool" && (product.tool_kind === "shelf" ||
    (identity !== null && typeof identity === "object" && "schema" in identity && identity.schema === 2)) ? "shelf_tool" : "tool";
}
export function productKindLabel(product: ProductKindSource | null | undefined) {
  return productKindLabels[productKind(product)];
}
