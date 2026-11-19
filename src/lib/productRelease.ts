export type ReleaseProjectDetails = {scene:string;houdini:string;dependencies:string[]};
export type ProductRelease = {
  id: string; version: string; compatibility: string; notes: string;
  published_at: string; available: boolean; latest: boolean; project?: ReleaseProjectDetails | null;
};
export type ReleaseRequest = {
  requestId: string; expectedReleaseId: string; compatibility: string; notes: string;
};
export const releaseUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseReleaseRequest(value: unknown): ReleaseRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  if (Object.keys(r).sort().join(',') !== 'compatibility,expectedReleaseId,notes,requestId' ||
      typeof r.requestId !== 'string' || !releaseUuid.test(r.requestId) ||
      typeof r.expectedReleaseId !== 'string' || !releaseUuid.test(r.expectedReleaseId) ||
      typeof r.compatibility !== 'string' || !/^Houdini (2[1-9]|30) and newer$/.test(r.compatibility) ||
      typeof r.notes !== 'string' || r.notes.length > 2000) return null;
  return r as ReleaseRequest;
}

// Expose only purchase requirements, never private archive paths or full manifests.
export function releaseProjectDetails(value:unknown):ReleaseProjectDetails|null {
  if(!value||typeof value!=="object"||Array.isArray(value))return null;
  const manifest=value as Record<string,unknown>;
  if(typeof manifest.scene!=="string"||typeof manifest.houdini!=="string"||!Array.isArray(manifest.warnings))return null;
  const dependencies=[...new Set(manifest.warnings.flatMap(w=>w&&typeof w==="object"&&typeof w.type==="string"?[w.type]:[]))];
  return {scene:manifest.scene,houdini:manifest.houdini,dependencies};
}
