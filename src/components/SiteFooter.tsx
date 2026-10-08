import Link from "next/link";
import type { ReactNode } from "react";

export default function SiteFooter({children}: {children?: ReactNode}) {
  return <footer className="site-footer"><div className="site-footer-brand"><Link href="/">qatools</Link>{children && <span>{children}</span>}</div><nav aria-label="Website information"><Link href="/information">Information</Link></nav></footer>;
}
