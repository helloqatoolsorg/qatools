import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { paddleCartDatabase } from "@/lib/paddleCartDatabase";
import { verifyCatalogPrice } from "@/lib/paddleCartCatalog";
import { validDraft, draftValidationErrors } from "@/lib/productDraft";
const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function readText(request: Request, max: number): Promise<string | null> {
  const reader = request.body?.getReader(); if (!reader) return "";
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length;
    if (size > max) { await reader.cancel(); return null; } chunks.push(part.value); }
  return Buffer.concat(chunks).toString("utf8");
}
export async function GET(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.response) { auth.response.headers.set("Cache-Control", "no-store"); return auth.response; }
    const results = await Promise.all([
      supabaseAdmin.from("products").select("id,name,slug,subtitle,description,price_eur,compatibility,current_version,release_date,category_id,complexity_id,product_type,published,updated_at,product_media(id,file_path,role,sort_order)").order("id", { ascending: false }).limit(501),
      supabaseAdmin.from("category").select("id,name,active,sort_order").order("sort_order"),
      supabaseAdmin.from("complexity").select("id,name,active,sort_order").order("sort_order"),
      supabaseAdmin.from("product_members").select("product_id,tool_id", { count: "exact" }).limit(1000),
    ]);
    if (results.some(r => r.error) || !results[0].data || results[0].data.length > 500 || results[3].count !== results[3].data?.length) return json({ error: "Unable to load the complete catalog. Please contact support." }, 503);
    return json({ products: results[0].data.map(p => ({ ...p, tool_ids: (results[3].data ?? []).filter(m => m.product_id === p.id).map(m => m.tool_id) })), categories: results[1].data, complexities: results[2].data });
  } catch { return json({ error: "Unable to load products." }, 503); }
}
export async function POST(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.response) { auth.response.headers.set("Cache-Control", "no-store"); return auth.response; }
    const raw = await readText(request, 128 * 1024);
    if (raw === null) return json({ error: "Draft is too large." }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: "Invalid draft." }, 400); }
    if (!body || typeof body !== "object" || Object.keys(body).some(k => !["requestId", "data", "productId", "expectedUpdatedAt"].includes(k))
      || typeof body.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.requestId) || !validDraft(body.data)
      || (body.productId !== undefined && (!Number.isSafeInteger(body.productId) || body.productId < 1 || typeof body.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(body.expectedUpdatedAt))))) return json({ error: draftValidationErrors(body?.data).join(" ") || "Invalid draft request. Reload before saving." }, 400);
    const { data, error } = await supabaseAdmin.rpc("save_product_draft", { p_admin_id: auth.user.id, p_request_id: body.requestId, p_data: body.data,
      ...(body.productId === undefined ? {} : { p_product_id: body.productId, p_expected_updated_at: body.expectedUpdatedAt }) });
    if (error) {
      if (error.code === "23505") return json({ error: "That product name is already in use." }, 409);
      if (error.code === "40001") return json({ error: "This draft changed or is already published. Reload before editing." }, 409);
      if (["22023", "22P02", "22003", "22007"].includes(error.code ?? "")) return json({ error: "Check the entered values and selected tools." }, 400);
      return json({ error: "Unable to save draft." }, 503);
    }
    return json({ draft: data, message: "Draft saved. This product is unpublished." });
  } catch { return json({ error: "Unable to save draft." }, 503); }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.response) { auth.response.headers.set("Cache-Control", "no-store"); return auth.response; }
    const raw = await readText(request, 1000);
    if (raw === null) return json({ error: "Invalid publishing request." }, 400);
    let body; try { body = JSON.parse(raw); } catch { return json({ error: "Invalid publishing request." }, 400); }
    if (!body || typeof body !== "object" || Object.keys(body).some(k => !["productId", "expectedUpdatedAt"].includes(k))
      || !Number.isSafeInteger(body.productId) || body.productId < 1 || typeof body.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(body.expectedUpdatedAt))) return json({ error: "Invalid publishing request." }, 400);
    const checks = await supabaseAdmin.rpc("product_publication_checks",{p_admin_id:auth.user.id,p_product_id:body.productId});
    if (checks.error || !checks.data) return json({error:"Unable to check publication requirements."},503);
    if (!checks.data.ready) return json({error:"Complete the missing publication requirements.",missing:checks.data.missing},400);
    const product = await supabaseAdmin.from("products").select("id,slug,price_eur,published,updated_at").eq("id",body.productId).maybeSingle();
    if (product.error || !product.data) return json({error:"Unable to verify product."},503);
    if (Date.parse(product.data.updated_at) !== Date.parse(body.expectedUpdatedAt)) return json({error:"This draft changed. Reload before publishing."},409);
    let priceId: string | null = null;
    if (Number(product.data.price_eur)>0) {
      const mapping=await paddleCartDatabase.from("sandbox_product_prices").select("product_id,price_id,paddle_product_id,enabled").eq("product_id",body.productId).maybeSingle();
      if(mapping.error || !mapping.data) return json({error:"Set up and verify the Paddle price before publishing."},409);
      try { await verifyCatalogPrice(product.data,mapping.data); } catch { return json({error:"The Paddle price no longer matches this draft. Refresh its price setup."},409); }
      priceId=mapping.data.price_id;
    }
    const { data, error } = await supabaseAdmin.rpc("publish_product_draft", { p_admin_id: auth.user.id, p_product_id: body.productId, p_expected_updated_at: body.expectedUpdatedAt, p_expected_price_id: priceId });
    if (error?.code === "22023") return json({ error: "Complete the publication checklist before publishing." }, 400);
    if (error?.code === "40001") return json({ error: "This draft changed or was already published. Reload it first." }, 409);
    if (error) return json({ error: "Unable to publish tool." }, 503);
    return json({ draft: data, message: "Product published." });
  } catch { return json({ error: "Unable to publish tool." }, 503); }
}
