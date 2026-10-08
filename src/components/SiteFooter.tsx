import Link from "next/link";
import type { ReactNode } from "react";

export default function SiteFooter({children}: {children?: ReactNode}) {
  return <footer className="site-footer"><div className="site-footer-brand"><Link href="/">qatools</Link>{children && <span>{children}</span>}</div><nav aria-label="Policy and support links"><Link href="/legal">Legal notice</Link><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/refunds">Refunds</Link><Link href="/support">Support</Link></nav></footer>;
}
