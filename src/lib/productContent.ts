export type ProductContent = { subtitle: string; description: string; category_id: number; complexity_id: number };
export function validProductContent(value: unknown): value is ProductContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).length === 4 && ["subtitle", "description", "category_id", "complexity_id"].every(k => k in v)
    && typeof v.subtitle === "string" && v.subtitle.trim().length > 0 && v.subtitle.length <= 200
    && typeof v.description === "string" && v.description.trim().length > 0 && v.description.length <= 20000
    && Number.isSafeInteger(v.category_id) && (v.category_id as number) > 0
    && Number.isSafeInteger(v.complexity_id) && (v.complexity_id as number) > 0;
}
