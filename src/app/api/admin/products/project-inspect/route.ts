import { readUpload } from "@/lib/adminDownloadUpload";
import { privateJson } from "@/lib/activationHttp";
import { PROJECT_UPLOAD_LIMIT, validateProjectArchive } from "@/lib/projectArchive";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.response) {
      auth.response.headers.set("Cache-Control", "no-store");
      return auth.response;
    }
    const bytes = await readUpload(request, PROJECT_UPLOAD_LIMIT);
    if (!bytes) return privateJson({error: "Project ZIP must be smaller than 4 MB."}, 413);

    let manifest;
    try { manifest = validateProjectArchive(bytes); }
    catch (error) { return privateJson({error: error instanceof Error ? error.message : "Invalid project ZIP."}, 400); }
    if (!manifest?.tools.length) return privateJson({manifest, toolIds: [], missing: []});

    const products = await supabaseAdmin.from("products").select("id,slug")
      .eq("product_type", "tool").eq("published", true).in("slug", manifest.tools);
    if (products.error) return privateJson({error: "Unable to look up included tools."}, 503);
    const ids = (products.data ?? []).map(product => product.id);
    const downloads = ids.length ? await supabaseAdmin.from("product_downloads").select("product_id,file_path")
      .eq("enabled", true).in("product_id", ids) : {data: [], error: null};
    if (downloads.error) return privateJson({error: "Unable to verify tool installers."}, 503);
    const available = new Map((products.data ?? []).filter(product => downloads.data?.some(download =>
      download.product_id === product.id && download.file_path?.startsWith(product.id + "/")))
      .map(product => [product.slug, product.id]));
    const toolIds = manifest.tools.flatMap(slug => available.has(slug) ? [available.get(slug)!] : []);
    return privateJson({manifest, toolIds, missing: manifest.tools.filter(slug => !available.has(slug))});
  } catch {
    return privateJson({error: "Unable to inspect the project ZIP."}, 503);
  }
}


export async function GET(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.response) {auth.response.headers.set("Cache-Control", "no-store"); return auth.response;}
    const raw = new URL(request.url).searchParams.get("productId") ?? "";
    if (!/^[1-9][0-9]*$/.test(raw) || !Number.isSafeInteger(Number(raw))) return privateJson({error: "Choose a saved project."}, 400);
    const result = await supabaseAdmin.from("bundle_releases").select("project_manifest").eq("product_id", Number(raw)).maybeSingle();
    if (result.error) return privateJson({error: "Unable to load project details."}, 503);
    return privateJson({manifest: result.data?.project_manifest ?? null});
  } catch {
    return privateJson({error: "Unable to load project details."}, 503);
  }
}
