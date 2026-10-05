import { randomUUID } from "node:crypto";
import { requireAccount } from "@/lib/requireAccount";
import { privateJson, readActivationBody } from "@/lib/activationHttp";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const authorization = await requireAccount(request, "download items");
    if (authorization.response) return authorization.response;
    const body = await readActivationBody(request);
    const id = body?.productId;
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) {
      return privateJson({ error: "Choose a valid item." }, 400);
    }
    const ownership = await supabaseAdmin.from("entitlements").select("id")
      .eq("user_id", authorization.user.id).eq("product_id", id).eq("status", "active").maybeSingle();
    if (ownership.error) return privateJson({ error: "Download service unavailable. Please try again later." }, 503);
    if (!ownership.data) return privateJson({ error: "You need active ownership to download this item." }, 403);
    const file = await supabaseAdmin.from("product_downloads").select("file_path,file_name")
      .eq("product_id", id).eq("enabled", true).maybeSingle();
    if (file.error) return privateJson({ error: "Download service unavailable. Please try again later." }, 503);
    if (!file.data) return privateJson({ error: "This item's download is not available yet." }, 404);
    const bucket = await supabaseAdmin.storage.getBucket("qatools-downloads");
    if (bucket.error || !bucket.data || bucket.data.public !== false) {
      return privateJson({ error: "Download service unavailable. Please try again later." }, 503);
    }
    const result = await supabaseAdmin.storage.from("qatools-downloads")
      .createSignedUrl(file.data.file_path, 120, { download: file.data.file_name });
    if (result.error || !result.data?.signedUrl) return privateJson({ error: "Unable to prepare this download. Please try again later." }, 503);
    const counted = await supabaseAdmin.rpc("record_product_download", { p_request_id: randomUUID(), p_user_id: authorization.user.id, p_product_id: id, p_file_path: file.data.file_path });
    if (counted.error || counted.data !== true) return privateJson({ error: "Unable to prepare this download. Please try again later." }, 503);
    return privateJson({ url: result.data.signedUrl });
  } catch { return privateJson({ error: "Download service unavailable. Please try again later." }, 503); }
}
