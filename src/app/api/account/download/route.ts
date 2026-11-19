import {releaseUuid} from "@/lib/productRelease";
import {releaseDelivery} from "@/lib/releaseDelivery";
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
    const releaseId=body?.releaseId;
    if(releaseId!==undefined && (typeof releaseId!=="string" || !releaseUuid.test(releaseId)))return privateJson({error:"Choose a valid version."},400);
    const ownership = await supabaseAdmin.from("entitlements").select("id")
      .eq("user_id", authorization.user.id).eq("product_id", id).eq("status", "active").maybeSingle();
    if (ownership.error) return privateJson({ error: "Download service unavailable. Please try again later." }, 503);
    if (!ownership.data) {
      const product = await supabaseAdmin.from("products").select("product_type,published").eq("id", id).maybeSingle();
      if (product.error) return privateJson({error:"Download service unavailable. Please try again later."},503);
      if (!product.data?.published || !["tool","bundle"].includes(product.data.product_type)) return privateJson({error:"You need active ownership to download this item."},403);
    }
    const file = releaseId
      ? await supabaseAdmin.from("product_releases").select("id,file_path,file_name,compatibility").eq("product_id",id).eq("id",releaseId).eq("available",true).maybeSingle()
      : await supabaseAdmin.from("product_downloads").select("file_path,file_name").eq("product_id",id).eq("enabled",true).maybeSingle();
    if (file.error) return privateJson({ error: "Download service unavailable. Please try again later." }, 503);
    if (!file.data) return privateJson({ error: "This version is no longer available. Refresh and choose another version." }, 404);
    let released: {id:string;file_path:string;file_name:string;compatibility:string}|null = null;
    if(releaseId && "id" in file.data && typeof file.data.id==="string" && "compatibility" in file.data && typeof file.data.compatibility==="string") {
      released={id:file.data.id,file_path:file.data.file_path,file_name:file.data.file_name,compatibility:file.data.compatibility};
    }
    if(releaseId&&!released)return privateJson({error:"Unable to verify this version."},503);
    if(!releaseId){
      const history=await supabaseAdmin.from("product_releases").select("id,file_path,file_name,compatibility").eq("product_id",id).eq("file_path",file.data.file_path).eq("available",true).maybeSingle();
      if(history.error)return privateJson({error:"Download service unavailable. Please try again later."},503);
      if(history.data?.id)released=history.data;
    }
    const bucket = await supabaseAdmin.storage.getBucket("qatools-downloads");
    if (bucket.error || !bucket.data || bucket.data.public !== false) {
      return privateJson({ error: "Download service unavailable. Please try again later." }, 503);
    }
    const deliveryPath = released ? await releaseDelivery(id,released) : file.data.file_path;
    const result = await supabaseAdmin.storage.from("qatools-downloads")
      .createSignedUrl(deliveryPath, 120, { download: file.data.file_name });
    if (result.error || !result.data?.signedUrl) return privateJson({ error: "Unable to prepare this download. Please try again later." }, 503);
    const counted = await supabaseAdmin.rpc("record_product_download", { p_request_id: randomUUID(), p_user_id: authorization.user.id, p_product_id: id, p_file_path: file.data.file_path });
    if (counted.error || counted.data !== true) return privateJson({ error: "Unable to prepare this download. Please try again later." }, 503);
    return privateJson({ url: result.data.signedUrl });
  } catch { return privateJson({ error: "Download service unavailable. Please try again later." }, 503); }
}
