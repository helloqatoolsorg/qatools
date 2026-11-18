// Preserve the short initial pause and keep the whole sequence within 250ms.
export function orderedStaggerDelay(index: number, count: number): string {
  const step = Math.min(60, 250 / Math.max(1, count - 1));
  return (250 + index * step) + "ms";
}
