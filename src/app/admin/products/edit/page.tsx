"use client";
import { AdminHeader, AdminSidebar } from "@/components/AdminNavigation";
import AdminProducts from "@/components/AdminProducts";
export default function ProductEditorPage() {
  return <div className="content-page"><AdminHeader /><main className="admin-workspace"><AdminSidebar active="products" /><div className="admin-workspace-content admin-editor-content"><AdminProducts editor /></div></main></div>;
}
