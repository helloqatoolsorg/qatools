type Callbacks = {near: () => void; visible: (visible: boolean) => void};
const targets = new Map<HTMLVideoElement, Callbacks>();
let nearObserver: IntersectionObserver | undefined;
let visibleObserver: IntersectionObserver | undefined;
let fallbackFrame: number | undefined;

function checkFallback() {
  fallbackFrame = undefined;
  for (const [video, callbacks] of targets) {
    const rect = video.getBoundingClientRect();
    if (rect.bottom > -600 && rect.top < window.innerHeight + 600 && rect.right > 0 && rect.left < window.innerWidth) callbacks.near();
    callbacks.visible(rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth);
  }
}
function scheduleFallback() {
  fallbackFrame ??= window.requestAnimationFrame(checkFallback);
}

// One shared pair of native observers handles the entire catalogue. No polling
// or per-card scroll listeners are needed in browsers with IntersectionObserver.
export function observeProductVideo(video: HTMLVideoElement, callbacks: Callbacks) {
  targets.set(video, callbacks);
  if (typeof IntersectionObserver !== "undefined") {
    nearObserver ??= new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        targets.get(entry.target as HTMLVideoElement)?.near();
        nearObserver?.unobserve(entry.target);
      }
    }, {rootMargin: "600px 0px", threshold: 0});
    visibleObserver ??= new IntersectionObserver(entries => {
      for (const entry of entries) targets.get(entry.target as HTMLVideoElement)?.visible(entry.isIntersecting && entry.intersectionRatio >= 0.01);
    }, {threshold: 0.01});
    nearObserver.observe(video);
    visibleObserver.observe(video);
  } else {
    if (targets.size === 1) {
      window.addEventListener("scroll", scheduleFallback, {passive: true});
      window.addEventListener("resize", scheduleFallback);
    }
    scheduleFallback();
  }
  return () => {
    targets.delete(video);
    nearObserver?.unobserve(video);
    visibleObserver?.unobserve(video);
    if (!targets.size) {
      nearObserver?.disconnect(); visibleObserver?.disconnect();
      nearObserver = undefined; visibleObserver = undefined;
      window.removeEventListener("scroll", scheduleFallback);
      window.removeEventListener("resize", scheduleFallback);
      if (fallbackFrame !== undefined) window.cancelAnimationFrame(fallbackFrame);
      fallbackFrame = undefined;
    }
  };
}
