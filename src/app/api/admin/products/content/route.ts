import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { privateJson, readActivationBody } from "@/lib/activationHttp";
import { validProductContent } from "@/lib/productContent";
export async function PUT(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.response) { auth.response.headers.set("Cache-Control", "no-store"); return auth.response; }
    const body = await readActivationBody(request, 128 * 1024);
    if (!body || Object.keys(body).length !== 4 || !Number.isSafeInteger(body.productId) || (body.productId as number) <= 0
      || typeof body.expectedUpdatedAt !== "string" || body.expectedUpdatedAt.length > 64 || !Number.isFinite(Date.parse(body.expectedUpdatedAt)) || !validProductContent(body.content)
      || !(body.media === null || Array.isArray(body.media) && body.media.length <= 20 && body.media.every(m => m && typeof m === "object" && Object.keys(m).length === 3 && (m.id === null || Number.isSafeInteger(m.id) && m.id > 0) && ["card", "main", "gallery", "detail"].includes(m.role) && typeof m.path === "string" && m.path.length <= 512))) {
      return privateJson({ error: "Enter a subtitle, description and valid category/complexity. Reload if the product changed." }, 400);
    }
    const result = await supabaseAdmin.rpc("save_published_product_content", {
      p_admin_id: auth.user.id, p_product_id: body.productId as number, p_expected_updated_at: body.expectedUpdatedAt, p_content: body.content, p_media: body.media,
    });
    if (result.error?.code === "40001") return privateJson({ error: "This product changed elsewhere. Reload before updating; your pending edits have not been applied." }, 409);
    if (result.error?.code === "22023") return privateJson({ error: "Check the subtitle, description, category and complexity selections." }, 400);
    if (result.error?.code === "42501") return privateJson({ error: "Admin access required." }, 403);
    if (result.error || !result.data) return privateJson({ error: "Unable to update the product. No content or image changes were applied. Reload to check before retrying." }, 503);
    return privateJson({ gallery: result.data, message: "Product updated." });
  } catch { return privateJson({ error: "Unable to update the product. Reload to check before retrying." }, 503); }
}
