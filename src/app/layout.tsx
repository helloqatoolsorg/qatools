import type { Metadata } from "next";

import "./globals.css";
import "./compact-nav.css";
import "./interactions.css";

import CartCountFeedback from "@/components/CartCountFeedback";
import CartMenu from "@/components/CartMenu";
import CompactNav from "@/components/CompactNav";
import UserMenu from "@/components/UserMenu";

import { AuthProvider } from "@/context/AuthContext";
import { QAToolsStateProvider } from "@/context/QAToolsState";

export const metadata: Metadata = {
  title: "qatools",
  description:
    "qatools for SideFX Houdini",
};

export default function RootLayout({
  children,
}: Readonly<{
  children:
    React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <AuthProvider>
          <QAToolsStateProvider>
            {children}

            <CompactNav />
            <CartCountFeedback />

            <UserMenu />

            <CartMenu />
          </QAToolsStateProvider>
        </AuthProvider>
      </body>
    </html>
  );
}