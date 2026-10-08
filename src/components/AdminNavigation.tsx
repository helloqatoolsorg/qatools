"use client";
import BrandLogo from "@/components/BrandLogo";
import OutlineIcon from "@/components/OutlineIcon";
import Link from "next/link";
import AccountName from "@/components/AccountName";
import { useQAToolsState } from "@/context/QAToolsState";
export const adminSections = [["dashboard", "Dashboard"], ["customers", "Customers / Accounts"], ["orders", "Orders"], ["products", "Products"], ["finance", "Finance"], ["payments", "Payment review"]] as const;
export function AdminHeader() {
  const { likedCount, cartCount } = useQAToolsState();
  return <header className="site-header">
    <Link className="brand" href="/"><BrandLogo /></Link>
    <nav className="main-nav"><Link href="/">products</Link><Link href="/install">how to install</Link><Link href="/whats-new">what’s new</Link></nav>
    <nav className="icon-nav"><AccountName />
      <Link className={"icon-link liked-nav-link " + (likedCount > 0 ? "has-likes" : "")} href="/liked" aria-label="Liked products" title="Liked products"><span className="liked-icon">♡</span><span className="liked-count">{likedCount > 0 ? likedCount : ""}</span></Link>
      <Link className="icon-link" href="/user" aria-label="Account" title="Account"><OutlineIcon kind="account" /></Link>
      <button id="cartButton" className={cartCount > 0 ? "cart-has-items" : ""} aria-label="Cart" title="Cart" type="button"><OutlineIcon kind="cart" /><span className="cart-count">{cartCount > 0 ? cartCount : ""}</span></button>
    </nav>
  </header>;
}
export function AdminSidebar({ active, onSelect }: { active: string; onSelect?: (id: string) => void }) {
  return <aside className="user-sidebar"><div className="user-title">ADMIN</div><nav aria-label="Admin sections">{adminSections.map(([id,label]) => onSelect ? <button key={id} type="button" className={"user-nav " + (active === id ? "active" : "")} aria-current={active === id ? "page" : undefined} onClick={() => onSelect(id)}>{label}</button> : <Link key={id} className={"user-nav " + (active === id ? "active" : "")} aria-current={active === id ? "page" : undefined} href={"/admin?section=" + id}>{label}</Link>)}</nav></aside>;
}
