"use client";

import { useAuth } from "@/context/AuthContext";

type OutlineIconProps = { kind: "cart" | "account" };

export default function OutlineIcon({ kind }: OutlineIconProps) {
  const { user } = useAuth();
  const signedIn = kind === "account" && Boolean(user);
  return (
    <svg className={`outline-icon ${signedIn ? "account-signed-in" : ""}`} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true" focusable="false">
      {kind === "cart" ? <rect x="5" y="5" width="14" height="14" /> : <circle cx="12" cy="12" r="7" />}
    </svg>
  );
}
