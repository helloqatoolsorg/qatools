import "server-only";
import {createHash} from "node:crypto";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
import type {ToolIdentity} from "@/lib/preparedTool";
import type {ProjectManifest} from "@/lib/projectArchive";
import type {ReleaseRequest} from "./productRelease";

export async function publishProductRelease(adminId:string, productId:number, path:string, name:string, bytes:Buffer,
  release:ReleaseRequest, extras:{identity?:ToolIdentity|null;sources?:{tool_id:number;file_path:string}[];projectSha?:string;manifest?:ProjectManifest|null} = {}) {
  const fingerprint=createHash('sha256').update(bytes).update(JSON.stringify({release,extras})).digest('hex');
  return supabaseAdmin.rpc('publish_product_update', {
    p_admin_id:adminId,p_product_id:productId,p_expected_release_id:release.expectedReleaseId,
    p_request_id:release.requestId,p_fingerprint:fingerprint,p_file_path:path,p_file_name:name,
    p_compatibility:release.compatibility,p_notes:release.notes,
    p_identity:extras.identity??null,p_sources:extras.sources??null,
    p_project_sha256:extras.projectSha??null,p_manifest:extras.manifest??null,
  });
}
