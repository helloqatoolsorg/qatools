import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { privateJson, readActivationBody } from "@/lib/activationHttp";
import { readUpload, validToolZip } from "@/lib/adminDownloadUpload";

async function authorize(request: Request) {
  const result = await requireAdmin(request);
  if (result.response) result.response.headers.set("Cache-Control", "no-store");
  return result;
}
function productId(value: unknown) { return typeof value === "number" && Number.isSafeInteger(value) && value > 0; }
function failure(code?: string) {
  const status = code === "not_admin" ? 403 : code === "missing_product" ? 404 : code === "download_changed" ? 409 : code === "missing_file" ? 409 : 400;
  const error = code === "download_changed" ? "This download changed. Refresh before saving." : code === "missing_file" ? "Upload a file to the private bucket before enabling this download." : "Unable to save this download.";
  return privateJson({ error }, status);
}
export async function GET(request: Request) {
  try {
    const auth = await authorize(request); if (auth.response) return auth.response;
    const value = new URL(request.url).searchParams.get("productId");
    const id = Number(value);
    if (!value || !/^[1-9][0-9]*$/.test(value) || !productId(id)) return privateJson({ error: "Choose a valid item." }, 400);
    const result = await supabaseAdmin.from("product_downloads").select("product_id,file_path,file_name,enabled").eq("product_id", id).maybeSingle();
    if (result.error) return privateJson({ error: "Unable to load this download." }, 503);
    return privateJson({ download: result.data });
  } catch { return privateJson({ error: "Download management unavailable." }, 503); }
}
export async function PATCH(request: Request) {
  try {
    const auth = await authorize(request); if (auth.response) return auth.response;
    const body = await readActivationBody(request, 2048);
    if (!body || !productId(body.productId) || typeof body.enabled !== "boolean" || typeof body.expectedPath !== "string" || body.expectedPath.length > 512) return privateJson({ error: "Choose a valid download." }, 400);
    const result = await supabaseAdmin.rpc("set_product_download", { p_admin_id: auth.user.id, p_product_id: body.productId as number, p_expected_path: body.expectedPath, p_file_path: null, p_file_name: null, p_enabled: body.enabled });
    if (result.error) return privateJson({ error: "Unable to save this download." }, 503);
    return result.data?.ok ? privateJson({ message: body.enabled ? "Download enabled." : "Download disabled." }) : failure(result.data?.code);
  } catch { return privateJson({ error: "Download management unavailable." }, 503); }
}
export async function POST(request: Request) {
  try {
    const auth = await authorize(request); if (auth.response) return auth.response;
    const params = new URL(request.url).searchParams, value = params.get("productId"), id = Number(value), name = params.get("fileName"), expected = params.get("expectedPath");
    if (!value || !/^[1-9][0-9]*$/.test(value) || !productId(id) || !name || name.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.zip$/i.test(name) || expected === null || expected.length > 512 || request.headers.get("content-type") !== "application/zip") return privateJson({ error: "Choose an item and a ZIP package with a simple filename." }, 400);
    const product = await supabaseAdmin.from("products").select("id,product_type,prepared_identity").eq("id", id).maybeSingle();
    if (product.error) return privateJson({ error: "Unable to verify item." }, 503);
    if (!product.data) return privateJson({ error: "Item not found." }, 404);
    if (product.data.prepared_identity) return privateJson({error:"Use the product editor to replace this tool with a matching prepared ZIP."},409);
    if (product.data.product_type !== "tool") return privateJson({error:"Use the product editor to upload and validate a bundle installer."},409);
    const current = await supabaseAdmin.from("product_downloads").select("file_path").eq("product_id", id).maybeSingle();
    if (current.error) return privateJson({ error: "Unable to verify current download." }, 503);
    if ((current.data?.file_path ?? "") !== expected) return failure("download_changed");
    const bytes = await readUpload(request);
    if (bytes === null) return privateJson({ error: "ZIP packages must be no larger than 25 MB." }, 413);
    if (!validToolZip(bytes)) return privateJson({ error: "Choose a valid ZIP package without private configuration files, encrypted entries or unsafe paths." }, 400);
    const bucket = await supabaseAdmin.storage.getBucket("qatools-downloads");
    if (bucket.error || bucket.data?.public !== false) return privateJson({ error: "The private download bucket is unavailable." }, 503);
    const path = `${id}/${randomUUID()}/${name}`;
    const upload = await supabaseAdmin.storage.from("qatools-downloads").upload(path, bytes, { contentType: "application/zip", upsert: false });
    if (upload.error) return privateJson({ error: "Upload failed. The current download was retained." }, 503);
    const result = await supabaseAdmin.rpc("set_product_download", { p_admin_id: auth.user.id, p_product_id: id, p_expected_path: expected || null, p_file_path: path, p_file_name: name, p_enabled: true });
    // Keep uploaded/previous objects; never delete a customer's existing release.
    if (result.error) return privateJson({ error: "File uploaded, but the download could not be saved. Refresh before retrying." }, 503);
    return result.data?.ok ? privateJson({ message: "Package uploaded and download enabled." }) : failure(result.data?.code);
  } catch { return privateJson({ error: "Download management unavailable. Refresh before retrying." }, 503); }
}
