"use client";

import { useState } from "react";
import "./ProductGallery.css";

type GalleryImage = { id: number; src: string };

export default function ProductGallery({ images, name }: { images: GalleryImage[]; name: string }) {
  const [selected, setSelected] = useState(0);
  const index = selected < images.length ? selected : 0;
  const image = images[index];

  function move(direction: number) {
    setSelected((index + direction + images.length) % images.length);
  }

  return (
    <div className="product-gallery" role="region" aria-label={`${name} images`}
      onKeyDown={(event) => {
        if (images.length < 2) return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          move(event.key === "ArrowLeft" ? -1 : 1);
        }
      }}>
      <div className="product-media product-gallery-stage">
        {image ? <img id="productImage" src={image.src} alt={`${name} preview ${index + 1}`} />
          : <span className="product-gallery-empty">No media</span>}
        {images.length > 1 && <>
          <button type="button" className="product-gallery-arrow previous" aria-label="Previous image" onClick={() => move(-1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7" /></svg>
          </button>
          <button type="button" className="product-gallery-arrow next" aria-label="Next image" onClick={() => move(1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 5 7 7-7 7" /></svg>
          </button>
        </>}
      </div>
      {images.length > 1 && <div className="product-gallery-thumbnails" aria-label="Choose an image">
        {images.map((item, position) => <button key={item.id} type="button"
          className={`product-gallery-thumbnail${position === index ? " selected" : ""}`}
          aria-label={`Show image ${position + 1} of ${images.length}`}
          aria-pressed={position === index} onClick={() => setSelected(position)}>
          <img src={item.src} alt="" loading="lazy" />
        </button>)}
      </div>}
      <span className="product-gallery-status" aria-live="polite" aria-atomic="true">
        {image ? `Image ${index + 1} of ${images.length}` : "No images"}
      </span>
    </div>
  );
}
