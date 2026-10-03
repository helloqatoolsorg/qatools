import { requireAccount } from "@/lib/requireAccount";
import { privateJson, readActivationBody } from "@/lib/activationHttp";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const authorization = await requireAccount(request, "acquire items");
    if (authorization.response) return authorization.response;
    const body = await readActivationBody(request, 4096);
    const ids = body?.productIds;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 50 ||
      ids.some(id => typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
      return privateJson({ error: "Choose between 1 and 50 valid, distinct items." }, 400);
    }
    const { data, error } = await supabaseAdmin.rpc("acquire_free_items", {
      p_user_id: authorization.user.id, p_product_ids: ids,
    });
    if (error) {
      if (error.code === "P0001" && error.message === "ownership_inactive") {
        return privateJson({ error: "An item has inactive ownership. Contact support for help." }, 409);
      }
      return privateJson({ error: "Unable to acquire items. Please try again later." }, 503);
    }
    if (!data?.ok) {
      if (data?.code === "account_unavailable") return privateJson({ error: "A confirmed, available account is required." }, 403);
      if (data?.code === "ownership_inactive") return privateJson({ error: "An item has inactive ownership. Contact support for help." }, 409);
      if (data?.code === "not_free") return privateJson({ error: "Some items are no longer available for free. Refresh your cart." }, 409);
      return privateJson({ error: "Unable to acquire these items." }, 400);
    }
    return privateJson({ products: data.products, message: "Free items added to your account." });
  } catch { return privateJson({ error: "Unable to acquire items. Please try again later." }, 503); }
}
