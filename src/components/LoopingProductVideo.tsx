"use client";

import {useCallback, useEffect, useRef, type ComponentPropsWithRef} from "react";
import {observeProductVideo} from "./productVideoVisibility";

type Props = Omit<ComponentPropsWithRef<"video">, "autoPlay" | "loop" | "muted" | "playsInline" | "controls" | "src"> & {
  src?: string;
  lazy?: boolean;
};

export default function LoopingProductVideo({lazy = false, src, ref: externalRef, ...props}: Props) {
  const node = useRef<HTMLVideoElement | null>(null);
  // Moving a card between rows must not reset a video that is already loaded.
  const eager = useRef(!lazy);
  const bind = useCallback((video: HTMLVideoElement | null) => {
    node.current = video;
    if (typeof externalRef === "function") return externalRef(video);
    if (externalRef) externalRef.current = video;
  }, [externalRef]);

  useEffect(() => {
    const video = node.current;
    if (!video) return;
    // Recovery previews can supply a blob URL through their existing ref.
    const source = src ?? video.getAttribute("src");
    let loaded = Boolean(video.getAttribute("src"));
    let visible = false;
    let disposed = false;
    function syncPlayback() {
      if (disposed || !visible || document.visibilityState === "hidden") {video!.pause(); return;}
      if (loaded && video!.paused) void video!.play()?.catch(() => {/* Autoplay denial is temporary, not a broken file. */});
    }
    function load() {
      if (disposed || loaded || !source) return;
      loaded = true;
      video!.preload = "auto";
      video!.src = source;
      video!.load();
      syncPlayback();
    }
    const stop = observeProductVideo(video, {near: load, visible: value => {visible = value; syncPlayback();}});
    video.addEventListener("loadeddata", syncPlayback);
    document.addEventListener("visibilitychange", syncPlayback);
    if (eager.current) load();
    return () => {
      disposed = true;
      stop(); video.removeEventListener("loadeddata", syncPlayback);
      document.removeEventListener("visibilitychange", syncPlayback);
      video.pause();
      if (src && video.getAttribute("src") === src) {video.removeAttribute("src"); video.load();}
    };
  }, [src]);

  // Withhold src until near the viewport. Native lazy-loading support alone is
  // insufficient to enforce the catalogue's bandwidth budget across browsers.
  return <video {...props} ref={bind} preload="none" autoPlay={false} loop muted playsInline />;
}
