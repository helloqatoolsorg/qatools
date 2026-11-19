export function normalizeCartSlugs(value: readonly unknown[]): string[] {
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))];
}

// Prune only the snapshot that was successfully checked; retain later additions.
export function reconcileCartItems(current: string[], checked: readonly string[], available: readonly string[]): string[] {
  const requested = new Set(checked), valid = new Set(available);
  const next = normalizeCartSlugs(current).filter(slug => !requested.has(slug) || valid.has(slug));
  return next.length === current.length && next.every((slug, index) => slug === current[index]) ? current : next;
}
