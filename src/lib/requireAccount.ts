import "server-only";
import { createClient, type User } from "@supabase/supabase-js";
import { privateJson } from "@/lib/activationHttp";

type Result = { user: User; response?: never } | { user?: never; response: ReturnType<typeof privateJson> };

export async function requireAccount(request: Request, action = "manage your activation key"): Promise<Result> {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return { response: privateJson({ error: `Please log in to ${action}.` }, 401) };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { response: privateJson({ error: "Account service unavailable." }, 503) };
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return { response: privateJson({ error: "Your session expired. Please log in again." }, 401) };
  if (!data.user.email_confirmed_at) return { response: privateJson({ error: `Confirm your email to ${action}.` }, 403) };
  return { user: data.user };
}
