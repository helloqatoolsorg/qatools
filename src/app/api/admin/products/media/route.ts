import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { imageFormat } from "@/lib/productMedia";
const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.response) { auth.response.headers.set("Cache-Control", "no-store"); return auth.response; }
    const params = new URL(request.url).searchParams;
    const rawId = params.get("productId") ?? "";
    const card = params.get("role") === "card", rawMedia = params.get("expectedMediaId") ?? "", expectedStamp = params.get("expectedUpdatedAt");
    if ((params.has("role") && !card) || (card && (expectedStamp === null || !Number.isFinite(Date.parse(expectedStamp)) || (rawMedia !== "" && (!/^[1-9][0-9]*$/.test(rawMedia) || !Number.isSafeInteger(Number(rawMedia))))))) return json({error:"Reload the draft before changing its main image."},400);
    if (!/^[1-9][0-9]{0,14}$/.test(rawId) || !Number.isSafeInteger(Number(rawId))) return json({ error: "Invalid product." }, 400);
    const id = Number(rawId);
    const { data: product, error: readError } = await supabaseAdmin.from("products").select("id,published").eq("id", id).maybeSingle();
    if (readError) return json({ error: "Unable to verify draft." }, 503);
    if (!product || product.published) return json({ error: "Choose an unpublished draft." }, 409);
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Choose an image." }, 400);
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > 4 * 1024 * 1024) { await reader.cancel(); return json({ error: "Choose an image up to 4 MB." }, 413); } chunks.push(part.value); }
    const bytes = Buffer.concat(chunks); const format = imageFormat(bytes);
    if (!format) return json({ error: "Choose a PNG, JPG or WebP image." }, 400);
    const { data: bucket, error: bucketError } = await supabaseAdmin.storage.getBucket("product-media");
    if (bucketError || !bucket?.public) return json({ error: "Product media storage is unavailable." }, 503);
    const path = "drafts/" + id + "/" + randomUUID() + "." + format;
    const { error: uploadError } = await supabaseAdmin.storage.from("product-media").upload(path, bytes, { contentType: "image/" + (format === "jpg" ? "jpeg" : format), upsert: false });
    if (uploadError) return json({ error: "Unable to upload image." }, 503);
    const result = card
      ? await supabaseAdmin.rpc("set_product_draft_card", { p_admin_id: auth.user.id, p_product_id: id, p_expected_media_id: rawMedia === "" ? null : Number(rawMedia), p_expected_updated_at: expectedStamp!, p_path: path })
      : await supabaseAdmin.rpc("attach_product_draft_image", { p_admin_id: auth.user.id, p_product_id: id, p_path: path });
    const { data, error } = result;
    if (error) { await supabaseAdmin.storage.from("product-media").remove([path]); return json({ error: "Unable to attach image. Reload the draft and check its media limit." }, 409); }
    return json({ draft: data, media: card && data && "media_id" in data ? { id: data.media_id, file_path: path, role: "card", sort_order: 0 } : null, message: card ? "Main image updated." : "Gallery image added." });
  } catch { return json({ error: "Unable to upload image." }, 503); }
}
