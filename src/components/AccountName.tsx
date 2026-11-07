"use client";

import { useAuth } from "@/context/AuthContext";

export default function AccountName() {
  const { user } = useAuth();
  if (!user?.email) return null;
  return <a className="account-name" href="/user" title={user.email}>{user.email}</a>;
}
