export function gallerySwipeDirection(start: { x: number; y: number }, end: { x: number; y: number }): -1 | 0 | 1 {
  const x = end.x - start.x;
  const y = end.y - start.y;
  if (Math.abs(x) < 45 || Math.abs(x) <= Math.abs(y) * 1.25) return 0;
  return x < 0 ? 1 : -1;
}
