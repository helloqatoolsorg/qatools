"use client";
import Image from "next/image";
import { defaultLogo, useSiteBranding } from "@/context/SiteBranding";
export default function BrandLogo() {
  const { url } = useSiteBranding();
  if (!url) return <span className="brand-logo-placeholder" aria-label="qatools" />;
  return <Image key={url} src={url} alt="qatools" width={145} height={54} unoptimized onError={event => {
    if (event.currentTarget.getAttribute("src") !== defaultLogo) event.currentTarget.src = defaultLogo;
  }} />;
}
