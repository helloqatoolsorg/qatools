import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { Database } from "@/lib/database.types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function squareIcon(bytes: Buffer) {
  return sharp(bytes, { limitInputPixels: 4096 * 4096 }).resize(64, 64, { fit: "cover", position: "centre" }).png().toBuffer();
}
async function readLogo(response: Response) {
  if (!response.ok || !response.body) throw new Error("Logo unavailable");
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > 8 * 1024 * 1024) { await reader.cancel(); throw new Error("Logo too large"); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
function imageResponse(bytes: Buffer) {
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
}
export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (url && key) {
      const client = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await client.from("site_branding").select("logo_path").eq("id", 1).single();
      if (!error && data?.logo_path && /^branding\/logos\/[a-f0-9-]{36}\.png$/.test(data.logo_path)) {
        const target = client.storage.from("product-media").getPublicUrl(data.logo_path).data.publicUrl;
        const response = await fetch(target, { signal: AbortSignal.timeout(5000), cache: "no-store" });
        return imageResponse(await squareIcon(await readLogo(response)));
      }
    }
  } catch { /* Use the packaged logo if settings or storage are unavailable. */ }
  try {
    const bytes = await readFile(path.join(process.cwd(), "public/assets/qatools_logo.png"));
    return imageResponse(await squareIcon(bytes));
  } catch { return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
