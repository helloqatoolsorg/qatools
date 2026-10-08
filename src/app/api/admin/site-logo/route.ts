import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { privateJson, readActivationBody } from "@/lib/activationHttp";
import { imageFormat } from "@/lib/productMedia";

export const runtime = "nodejs";
const validRevision = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v);
async function authorize(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) auth.response.headers.set("Cache-Control", "no-store");
  return auth;
}
export async function GET(request: Request) {
  try {
    const auth = await authorize(request); if (auth.response) return auth.response;
    const row = await supabaseAdmin.from("site_branding").select("logo_path,revision").eq("id", 1).single();
    if (row.error) return privateJson({ error: "Unable to load the logo. Check the logo migration is applied." }, 503);
    return privateJson(row.data);
  } catch { return privateJson({ error: "Unable to load the logo." }, 503); }
}
async function save(path: string | null, revision: string) {
  const row = await supabaseAdmin.from("site_branding").update({ logo_path: path, revision: randomUUID() }).eq("id", 1).eq("revision", revision).select("logo_path,revision").maybeSingle();
  if (row.error) return privateJson({ error: "Unable to save the logo. Reload to check its current state." }, 503);
  if (!row.data) return privateJson({ error: "The logo changed elsewhere. Reload before trying again." }, 409);
  return privateJson(row.data);
}
export async function POST(request: Request) {
  try {
    const auth = await authorize(request); if (auth.response) return auth.response;
    const revision = new URL(request.url).searchParams.get("revision");
    if (!validRevision(revision)) return privateJson({ error: "Reload the logo controls before saving." }, 400);
    const current = await supabaseAdmin.from("site_branding").select("revision").eq("id", 1).single();
    if (current.error) return privateJson({ error: "Unable to verify the current logo." }, 503);
    if (current.data.revision !== revision) return privateJson({ error: "The logo changed elsewhere. Reload before trying again." }, 409);
    const reader = request.body?.getReader(); if (!reader) return privateJson({ error: "Choose a PNG or WebP logo." }, 400);
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.byteLength;
        if (size > 2 * 1024 * 1024) { await reader.cancel(); return privateJson({ error: "Choose a logo up to 2 MB." }, 413); }
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    const bytes = Buffer.concat(chunks), format = imageFormat(bytes);
    if (format !== "png" && format !== "webp") return privateJson({ error: "Choose a PNG or WebP logo." }, 400);
    let png: Buffer;
    try {
      const image = sharp(bytes, { limitInputPixels: 4096 * 4096, animated: false });
      const meta = await image.metadata();
      if (!meta.width || !meta.height || meta.width > 4096 || meta.height > 4096 || (meta.pages ?? 1) > 1) return privateJson({ error: "Choose a still logo no larger than 4096 × 4096 pixels." }, 400);
      png = await image.resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).png().toBuffer();
    } catch { return privateJson({ error: "This image could not be read. Export a new PNG or WebP." }, 400); }
    const bucket = await supabaseAdmin.storage.getBucket("product-media");
    if (bucket.error || bucket.data?.public !== true) return privateJson({ error: "Logo storage is unavailable." }, 503);
    const path = `branding/logos/${randomUUID()}.png`;
    const upload = await supabaseAdmin.storage.from("product-media").upload(path, png, { contentType: "image/png", upsert: false, cacheControl: "31536000" });
    if (upload.error) return privateJson({ error: "Unable to upload the logo." }, 503);
    // Immutable uploads: failures or competing edits never overwrite the current logo.
    return await save(path, revision);
  } catch { return privateJson({ error: "Unable to update the logo. Reload to check its current state." }, 503); }
}
export async function DELETE(request: Request) {
  try {
    const auth = await authorize(request); if (auth.response) return auth.response;
    const body = await readActivationBody(request, 256);
    if (!body || Object.keys(body).length !== 1 || !validRevision(body.revision)) return privateJson({ error: "Reload the logo controls before restoring." }, 400);
    return await save(null, body.revision);
  } catch { return privateJson({ error: "Unable to restore the default logo." }, 503); }
}
