"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
export const defaultLogo = "/assets/qatools_logo.png";
export function logoUrl(path: string | null) {
  return path && /^branding\/logos\/[a-f0-9-]{36}\.png$/.test(path)
    ? supabase.storage.from("product-media").getPublicUrl(path).data.publicUrl : defaultLogo;
}
const BrandingContext = createContext({ url: defaultLogo, refresh: () => {} });
export function SiteBrandingProvider({ children }: { children: React.ReactNode }) {
  const [url, setUrl] = useState(defaultLogo);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(v => v + 1), []);
  useEffect(() => {
    let alive = true;
    supabase.from("site_branding").select("logo_path").eq("id", 1).single().then(({ data, error }) => {
      if (alive && !error && data) setUrl(logoUrl(data.logo_path));
    }, () => { /* Keep the last valid logo if the request fails. */ });
    return () => { alive = false; };
  }, [revision]);
  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);
  return <BrandingContext.Provider value={{ url, refresh }}>{children}</BrandingContext.Provider>;
}
export const useSiteBranding = () => useContext(BrandingContext);
