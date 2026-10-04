"use client";
import Link from "next/link";
import Image from "next/image";
import AccountName from "@/components/AccountName";
import AdminProducts from "@/components/AdminProducts";
export default function ProductEditorPage() {
  return <><header className="site-header"><Link className="brand" href="/"><Image src="/assets/qatools_logo.png" alt="qatools" width={145} height={40} /></Link><nav className="icon-nav"><AccountName /><a href="/admin?section=products">Admin</a></nav></header><main><AdminProducts editor /></main></>;
}
