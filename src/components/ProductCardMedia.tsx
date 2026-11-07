"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import { isWebmSource } from "@/lib/productMediaInput";
import LoopingProductVideo from "@/components/LoopingProductVideo";
import "./ProductCardMedia.css";

type Props = { src: string | null; name: string; eager?: boolean };

function CardPreview({ src, name, eager }: Props) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const inspectImage = useCallback((image: HTMLImageElement | null) => {
    if (image?.complete) setStatus(image.naturalWidth > 0 ? "ready" : "error");
  }, []);
  const inspectVideo = useCallback((video: HTMLVideoElement | null) => {
    if (video?.error) setStatus("error");
    else if (video && video.readyState >= 2) setStatus("ready");
  }, []);

  if (!src || status === "error") return <span className="product-card-media-fallback" role="img" aria-label={`${name} preview unavailable`}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="1.5" /><circle cx="8" cy="9" r="1.5" /><path d="m3 17 5-5 4 4 4-6 5 7" /></svg>
    <span>Preview unavailable</span>
  </span>;

  return <div className="product-card-media-content" data-state={status} aria-busy={status === "loading"}>
    {status === "loading" && <span className="product-card-media-placeholder" aria-hidden="true" />}
    {isWebmSource(src) ? <LoopingProductVideo ref={inspectVideo} src={src} aria-label={`${name} preview`} lazy={!eager}
      onLoadedData={() => setStatus("ready")} onError={() => setStatus("error")} /> :
    <Image ref={inspectImage} src={src} alt={`${name} preview`} fill unoptimized
      loading={eager ? "eager" : "lazy"} sizes="(max-width: 580px) 100vw, (max-width: 1000px) 50vw, 33vw"
      onLoad={() => setStatus("ready")} onError={() => setStatus("error")} />}
  </div>;
}

export default function ProductCardMedia(props: Props) {
  return <div className="media-frame product-card-media"><CardPreview key={props.src ?? "no-preview"} {...props} /></div>;
}
