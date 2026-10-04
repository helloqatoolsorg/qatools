export const productTypes = ["tool", "bundle", "project"] as const;
export type ProductType = typeof productTypes[number];
export type DraftInput = { name: string; product_type: ProductType; subtitle: string; description: string; price_eur: number; compatibility: string; current_version: string; release_date: string | null; category_id: number; complexity_id: number; tool_ids: number[] };
export function validDraft(value: unknown): value is DraftInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const d = value as Record<string, unknown>;
  const fields = ["name", "product_type", "subtitle", "description", "price_eur", "compatibility", "current_version", "release_date", "category_id", "complexity_id", "tool_ids"];
  if (Object.keys(d).some(key => !fields.includes(key))) return false;
  const text = (key: string, max: number) => typeof d[key] === "string" && (d[key] as string).trim().length > 0 && (d[key] as string).length <= max;
  return text("name", 80) && /^[a-z0-9][a-z0-9_-]{0,79}$/.test(d.name as string) && productTypes.includes(d.product_type as ProductType)
    && (d.release_date === null || (typeof d.release_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.release_date) && Number.isFinite(Date.parse(d.release_date)) && new Date(d.release_date).toISOString().slice(0,10) === d.release_date))
    && text("subtitle", 200) && text("description", 20000) && text("compatibility", 200) && text("current_version", 40)
    && typeof d.price_eur === "number" && Number.isFinite(d.price_eur) && d.price_eur >= 0 && d.price_eur <= 999999.99
    && Math.abs(d.price_eur * 100 - Math.round(d.price_eur * 100)) < 1e-7
    && Number.isSafeInteger(d.category_id) && (d.category_id as number) > 0 && Number.isSafeInteger(d.complexity_id) && (d.complexity_id as number) > 0
    && Array.isArray(d.tool_ids) && d.tool_ids.length <= 100 && new Set(d.tool_ids).size === d.tool_ids.length
    && d.tool_ids.every(id => Number.isSafeInteger(id) && id > 0) && (d.product_type === "tool" ? d.tool_ids.length === 0 : d.tool_ids.length > 0);
}
