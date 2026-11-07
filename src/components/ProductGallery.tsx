"use client";

import { useRef, useState, type PointerEvent } from "react";
import { gallerySwipeDirection } from "@/lib/galleryGesture";
import { isWebmSource } from "@/lib/productMediaInput";
import LoopingProductVideo from "@/components/LoopingProductVideo";
import "./ProductGallery.css";

type GalleryImage = { id: number; src: string };

export default function ProductGallery({ images, name }: { images: GalleryImage[]; name: string }) {
  const [selected, setSelected] = useState(0);
  const swipe = useRef<{ x: number; y: number; pointer: number } | null>(null);
  const index = selected < images.length ? selected : 0;
  const image = images[index];

  function move(direction: number) {
    if (images.length < 2) return;
    setSelected(current => ((current < images.length ? current : 0) + direction + images.length) % images.length);
  }

  function startSwipe(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch" || images.length < 2 || (event.target as Element).closest("button")) return;
    if (!event.isPrimary) { swipe.current = null; return; }
    swipe.current = { x: event.clientX, y: event.clientY, pointer: event.pointerId };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function finishSwipe(event: PointerEvent<HTMLDivElement>) {
    const start = swipe.current;
    swipe.current = null;
    if (!start || start.pointer !== event.pointerId) return;
    const direction = gallerySwipeDirection(start, { x: event.clientX, y: event.clientY });
    if (direction) move(direction);
  }

  return (
    <div className="product-gallery" role="region" aria-label={`${name} gallery`} tabIndex={0}
      onKeyDown={(event) => {
        if (images.length < 2) return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          move(event.key === "ArrowLeft" ? -1 : 1);
        }
      }}>
      <div className="product-media product-gallery-stage" onPointerDown={startSwipe} onPointerUp={finishSwipe}
        onPointerCancel={() => { swipe.current = null; }}>
        {/* Keep GIFs mounted. Play the selected WebM in the main view. */}
        {images.map((item, position) => {
          const current = position === index;
          const preview = `${name} preview ${position + 1}`;
          if (isWebmSource(item.src)) {
            return current ? <LoopingProductVideo key={item.id} id="productImage"
              className="product-gallery-image current" src={item.src} aria-label={preview} /> : null;
          }
          return <img key={item.id} id={current ? "productImage" : undefined}
            className={`product-gallery-image${current ? " current" : ""}`}
            src={item.src} alt={current ? preview : ""} aria-hidden={!current} draggable={false} />;
        })}
        {!image && <span className="product-gallery-empty">No media</span>}
        {images.length > 1 && <>
          <button type="button" className="product-gallery-arrow previous" aria-label="Previous preview" onClick={() => move(-1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7" /></svg>
          </button>
          <button type="button" className="product-gallery-arrow next" aria-label="Next preview" onClick={() => move(1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 5 7 7-7 7" /></svg>
          </button>
        </>}
      </div>
      {images.length > 1 && <div className="product-gallery-thumbnails" aria-label="Choose a preview">
        {images.map((item, position) => <button key={item.id} type="button"
          className={`product-gallery-thumbnail${position === index ? " selected" : ""}`}
          aria-label={`Show preview ${position + 1} of ${images.length}`}
          aria-pressed={position === index} onClick={() => setSelected(position)}>
          {isWebmSource(item.src) ? <LoopingProductVideo src={item.src} aria-hidden="true" lazy /> :
            <img src={item.src} alt="" loading="lazy" draggable={false} />}
        </button>)}
      </div>}
      <span className="product-gallery-status" aria-live="polite" aria-atomic="true">
        {image ? `Preview ${index + 1} of ${images.length}` : "No media"}
      </span>
    </div>
  );
}
