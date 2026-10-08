"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
export const defaultLogo = "/assets/qatools_logo.png";
export function logoUrl(path: string | null) {
  return path && /^branding\/logos\/[a-f0-9-]{36}\.png$/.test(path)
    ? supabase.storage.from("product-media").getPublicUrl(path).data.publicUrl : defaultLogo;
}
const BrandingContext = createContext<{ url: string | null; refresh: () => void }>({ url: null, refresh: () => {} });
export function SiteBrandingProvider({ children }: { children: React.ReactNode }) {
  const [url, setUrl] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(v => v + 1), []);
  useEffect(() => {
    let alive = true;
    supabase.from("site_branding").select("logo_path").eq("id", 1).single().then(({ data, error }) => {
      if (alive) setUrl(previous => !error && data ? logoUrl(data.logo_path) : previous ?? defaultLogo);
    }, () => { if (alive) setUrl(previous => previous ?? defaultLogo); });
    return () => { alive = false; };
  }, [revision]);
  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);
  useEffect(() => {
    if (!url) return;
    document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]').forEach(icon => {
      icon.href = `/api/site-icon?v=${encodeURIComponent(url)}`; icon.type = "image/png"; icon.sizes.value = "64x64";
    });
  }, [url]);
  return <BrandingContext.Provider value={{ url, refresh }}>{children}</BrandingContext.Provider>;
}
export const useSiteBranding = () => useContext(BrandingContext);
