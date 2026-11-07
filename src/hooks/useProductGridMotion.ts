"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

type Position = { left: number; top: number };

export function useProductGridMotion(items: readonly { id: number }[]) {
  const grid = useRef<HTMLElement | null>(null);
  const previous = useRef(new Map<string, Position>());
  const animations = useRef<Animation[]>([]);
  const measured = useRef(false);
  const signature = items.map(item => item.id).join(",");

  useLayoutEffect(() => {
    for (const animation of animations.current) animation.cancel();
    animations.current = [];
    if (!grid.current) { previous.current.clear(); return; }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<string, Position>();
    for (const card of grid.current.querySelectorAll<HTMLElement>(".product-card[data-id]")) {
      const rect = card.getBoundingClientRect();
      const position = { left: rect.left + window.scrollX, top: rect.top + window.scrollY };
      const id = card.dataset.id!;
      next.set(id, position);
      if (!measured.current || reducedMotion || typeof card.animate !== "function") continue;
      const old = previous.current.get(id);
      if (old) {
        const x = old.left - position.left, y = old.top - position.top;
        if (Math.abs(x) + Math.abs(y) > 1) animations.current.push(card.animate([
          { transform: `translate(${x}px, ${y}px)` }, { transform: "translate(0, 0)" },
        ], { duration: 380, easing: "cubic-bezier(.22,.75,.25,1)" }));
      } else {
        animations.current.push(card.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 320, easing: "ease-out" }));
      }
    }
    previous.current = next;
    measured.current = true;
  }, [signature]);

  useEffect(() => {
    function resize() {
      for (const animation of animations.current) animation.cancel();
      animations.current = [];
      previous.current.clear();
      for (const card of grid.current?.querySelectorAll<HTMLElement>(".product-card[data-id]") ?? []) {
        const rect = card.getBoundingClientRect();
        previous.current.set(card.dataset.id!, { left: rect.left + window.scrollX, top: rect.top + window.scrollY });
      }
    }
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      for (const animation of animations.current) animation.cancel();
    };
  }, []);

  return grid;
}
