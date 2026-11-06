import Link from "next/link";
import type { ReactNode } from "react";

export default function SiteFooter({children}: {children?: ReactNode}) {
  return <footer className="site-footer"><div className="site-footer-brand"><Link href="/">QATools</Link>{children && <span>{children}</span>}</div><nav aria-label="Website information"><Link href="/information#terms">Terms</Link><Link href="/information#refunds">Refunds</Link><Link href="/information#privacy">Privacy</Link><Link href="/information#support">Support</Link></nav></footer>;
}
