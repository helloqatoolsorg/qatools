// Display padding is independent of the immutable database reference.
export function formatOrderNumber(reference: string | null): string {
  if (!reference) return "Not numbered";
  return `#${reference.replace(/^(sandbox-|development-)?0+(\d+)$/, (_, prefix: string | undefined, digits: string) =>
    `${prefix ?? ""}${digits.padStart(5, "0")}`)}`;
}
