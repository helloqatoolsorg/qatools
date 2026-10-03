import "server-only";
import { NextResponse } from "next/server";
import { createClient, type User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type AdminResult = { user: User; response?: never } | { user?: never; response: NextResponse };

// Every privileged route calls this independently. Browser UI gates are not authorization.
export async function requireAdmin(request: Request): Promise<AdminResult> {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { response: NextResponse.json({ error: "Server configuration error." }, { status: 500 }) };
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return { response: NextResponse.json({ error: "Invalid or expired session." }, { status: 401 }) };
  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("admin_users").select("user_id").eq("user_id", data.user.id).maybeSingle();
  if (membershipError) return { response: NextResponse.json({ error: "Unable to verify admin access." }, { status: 500 }) };
  if (!membership) return { response: NextResponse.json({ error: "Admin access required." }, { status: 403 }) };
  return { user: data.user };
}
