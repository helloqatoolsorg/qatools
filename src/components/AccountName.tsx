"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

export default function AccountName() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => {
    if (!user) return;
    let canceled = false;
    const id = user.id;
    async function refreshName() {
      const { data } = await supabase.from("profiles").select("name").eq("user_id", id).maybeSingle();
      if (!canceled) setProfile({ id, name: data?.name?.trim() || "My account" });
    }
    void refreshName();
    window.addEventListener("qatools-profile-updated", refreshName);
    return () => { canceled = true; window.removeEventListener("qatools-profile-updated", refreshName); };
  }, [user]);
  if (!user) return null;
  const name = profile?.id === user.id ? profile.name : "My account";
  return <a className="account-name" href="/user" title={name}>{name}</a>;
}
