"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import BrandLogo from "@/components/BrandLogo";
import OutlineIcon from "@/components/OutlineIcon";
import AccountName from "@/components/AccountName";
import SiteFooter from "@/components/SiteFooter";
import { useQAToolsState } from "@/context/QAToolsState";

export default function InformationPage({title,children,policy=false}: {title:string;children:ReactNode;policy?:boolean}) {
  const {likedCount,cartCount}=useQAToolsState();
  return <div className="content-page"><header className="site-header"><Link className="brand" href="/"><BrandLogo /></Link><nav className="main-nav"><Link href="/">products</Link><Link href="/install">how to install</Link><Link href="/whats-new">what&apos;s new</Link></nav><nav className="icon-nav"><AccountName /><Link className={`icon-link liked-nav-link ${likedCount>0?"has-likes":""}`} href="/liked" aria-label="Liked products" title="Liked products"><span className="liked-icon"><OutlineIcon kind="heart" /></span><span className="liked-count">{likedCount>0?likedCount:""}</span></Link><Link className="icon-link" href="/user" aria-label="Account" title="Account"><OutlineIcon kind="account" /></Link><button id="cartButton" className={cartCount>0?"cart-has-items":""} aria-label="Cart" title="Cart" type="button"><OutlineIcon kind="cart" /><span className="cart-count">{cartCount>0?cartCount:""}</span></button></nav></header><main className="standalone-page information-page"><span className="eyebrow">qatools</span><h1>{title}</h1>{policy && <aside className="policy-preview"><strong>Pre-launch draft · 8 October 2026</strong><p>These policies are being prepared before live sales. Business disclosures and final policy review are still in progress.</p></aside>}<div className="information-content">{children}</div></main><SiteFooter>{title.toLowerCase()}</SiteFooter></div>;
}
