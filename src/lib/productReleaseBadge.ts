const badgeLifetime = 30 * 24 * 60 * 60 * 1000;

export function productReleaseBadge(releasedAt?: string | null, updatedAt?: string | null, now = Date.now()): "NEW" | "updated" | null {
  const release = releasedAt ? Date.parse(releasedAt) : NaN;
  const update = updatedAt ? Date.parse(updatedAt) : NaN;
  const recent = (date: number) => Number.isFinite(date) && date <= now && now - date < badgeLifetime;
  if (!Number.isFinite(release) || release > now) return null;
  if (update >= release && recent(update)) return "updated";
  return recent(release) ? "NEW" : null;
}
