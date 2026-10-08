"use client";

import { useAuth } from "@/context/AuthContext";

type OutlineIconProps = { kind: "cart" | "account" | "heart" };

export default function OutlineIcon({ kind }: OutlineIconProps) {
  const { user } = useAuth();
  const signedIn = kind === "account" && Boolean(user);
  return (
    <svg className={`outline-icon ${signedIn ? "account-signed-in" : ""}`} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true" focusable="false">
      {kind === "cart" ? <rect x="5" y="5" width="14" height="14" /> : kind === "account" ? <circle cx="12" cy="12" r="7" /> : <path transform="translate(12 12) scale(0.74) translate(-12 -12)" strokeWidth={1 / 0.74} d="M12 20.5 3.8 12.7C-.4 8.8 2.2 3.5 6.4 3.5c2.4 0 4.1 1.5 5.6 3.2 1.5-1.7 3.2-3.2 5.6-3.2 4.2 0 6.8 5.3 2.6 9.2Z" strokeLinejoin="round" strokeLinecap="round" />}
    </svg>
  );
}
