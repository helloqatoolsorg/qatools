"use client";

import {useEffect, useRef, type CSSProperties} from "react";
import {productReleaseBadge} from "@/lib/productReleaseBadge";
import {orderedStaggerDelay} from "@/lib/orderedStagger";
import "./ProductReleaseBadge.css";

type Props = {releasedAt?: string | null; updatedAt?: string | null; animationOrder?: number; animationCount?: number};
export default function ProductReleaseBadge({releasedAt, updatedAt, animationOrder = 0, animationCount = 1}:Props) {
  const badge = productReleaseBadge(releasedAt, updatedAt);
  const badgeRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const element = badgeRef.current;
    if (badge !== "NEW" || !element) return;
    let firstFrame = 0, secondFrame = 0;
    function afterPageLoad() {
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => {
          element!.dataset.ready = "true";
        });
      });
    }
    if (document.readyState === "complete") afterPageLoad();
    else window.addEventListener("load", afterPageLoad, { once: true });
    return () => {
      window.removeEventListener("load", afterPageLoad);
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      delete element.dataset.ready;
    };
  }, [badge]);
  return badge ? <span ref={badgeRef} style={{"--product-badge-delay": orderedStaggerDelay(animationOrder, animationCount)} as CSSProperties}
    className={"product-release-badge" + (badge === "NEW" ? " product-release-badge-new" : "")}>{badge}</span> : null;
}
