import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/requireAdmin";
import { privateJson } from "@/lib/activationHttp";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildHoudiniPackage, validHda, packageConfig } from "@/lib/houdiniPackage";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const auth = await requireAdmin(request); if (auth.response) { auth.response.headers.set("Cache-Control","no-store"); return auth.response; }
    const params = new URL(request.url).searchParams, rawId = params.get("productId") ?? "", expected = params.get("expectedPath");
    if (!/^[1-9][0-9]*$/.test(rawId) || !Number.isSafeInteger(Number(rawId)) || expected === null || expected.length > 512 || !request.headers.get("content-type")?.startsWith("multipart/form-data;")) return privateJson({ error: "Choose a valid tool and installer files." },400);
    const id = Number(rawId);
    const product = await supabaseAdmin.from("products").select("id,slug,product_type,published").eq("id",id).maybeSingle();
    if (product.error) return privateJson({ error: "Unable to verify tool." },503);
    if (!product.data || product.data.product_type !== "tool") return privateJson({ error: "Choose an individual tool." },409);
    const current = await supabaseAdmin.from("product_downloads").select("file_path").eq("product_id",id).maybeSingle();
    if (current.error) return privateJson({ error: "Unable to verify current package." },503);
    if ((current.data?.file_path ?? "") !== expected) return privateJson({ error: "This package changed. Reload before uploading." },409);
    const reader = request.body?.getReader(); if (!reader) return privateJson({ error: "Choose a Houdini HDA." },400);
    let size = 0; const chunks: Uint8Array[] = [];
    try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 4 * 1024 * 1024) { await reader.cancel(); return privateJson({ error: "Installer inputs must total less than 4 MB." },413); } chunks.push(part.value); } } finally { reader.releaseLock(); }
    let form: FormData;
    try { form = await new Request("http://localhost", { method:"POST", headers:{"Content-Type":request.headers.get("content-type")!}, body:Buffer.concat(chunks) }).formData(); } catch { return privateJson({ error:"Invalid file upload." },400); }
    const hda = form.get("tool");
    if (!(hda instanceof File) || form.getAll("tool").length !== 1 || [...form.keys()].some(k => k !== "tool")) return privateJson({ error:"Choose a Houdini HDA." },400);
    const toolBytes = Buffer.from(await hda.arrayBuffer()), jsonBytes = Buffer.from(JSON.stringify(packageConfig));
    if (!validHda(hda.name,toolBytes)) return privateJson({ error:"Choose a Houdini HDA and the standard qatools.json package configuration." },400);
    const bucket = await supabaseAdmin.storage.getBucket("qatools-downloads");
    if (bucket.error || bucket.data?.public !== false) return privateJson({ error:"Private package storage is unavailable." },503);
    const bytes = await buildHoudiniPackage(jsonBytes,[{name:hda.name,bytes:toolBytes}]);
    const fileName = product.data.slug + "-houdini22.zip";
    if (!/^[a-z0-9][a-z0-9_-]{0,79}-houdini22\.zip$/.test(fileName)) return privateJson({error:"Check the product identifier."},400);
    const path = id + "/" + randomUUID() + "/" + fileName;
    const uploaded = await supabaseAdmin.storage.from("qatools-downloads").upload(path,bytes,{contentType:"application/zip",upsert:false});
    if (uploaded.error) return privateJson({error:"Unable to save installer. Existing download retained."},503);
    const saved = await supabaseAdmin.rpc("set_product_download",{p_admin_id:auth.user.id,p_product_id:id,p_expected_path:expected || null,p_file_path:path,p_file_name:fileName,p_enabled:true});
    if (saved.error || !saved.data?.ok) return privateJson({error:"Installer uploaded but could not be selected. Reload before retrying."},409);
    return privateJson({message:product.data.published ? "Installer replaced. Existing owners can download this release." : "Installer saved. It contains qatools.json, the tool and shared licensing files. Publishing is a separate action.",download:{file_name:fileName,file_path:path,enabled:true}});
  } catch { return privateJson({error:"Unable to prepare installer."},503); }
}
