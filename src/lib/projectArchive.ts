import "server-only";
import { inflateRawSync } from "node:zlib";
import { validToolZip } from "./adminDownloadUpload";
import { crc32, validProjectPath, houdiniPackageEntries, makePackageZip, packageConfig, type PackageEntry } from "./houdiniPackage";

export const PROJECT_UPLOAD_LIMIT = 4 * 1024 * 1024 - 8192;
const manifestName = "qatools-project.json";
export type ProjectManifest = {
  schema: 1;
  label: string;
  slug: string;
  scene: string;
  houdini: string;
  tools: string[];
  warnings: {type: string; node: string}[];
};
export type ProjectInspection = {manifest: ProjectManifest | null; toolIds: number[]; missing: string[]};

function readManifest(bytes: Buffer, scenes: Set<string>): ProjectManifest {
  const invalid = () => new Error("Invalid project manifest. Export the project again with QA Project auth.");
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { throw invalid(); }
  const text = (input: unknown, max: number): input is string =>
    typeof input === "string" && input.length > 0 && input.length <= max && !/[\u0000-\u001f\ufffd]/.test(input);
  if (!value || value.schema !== 1 ||
      !text(value.label, 80) || !/^[A-Z0-9][a-z0-9]*(?: [A-Z0-9][a-z0-9]*)*$/.test(value.label) || !validProjectPath(value.label) ||
      value.slug !== value.label.toLowerCase().replaceAll(" ", "_") ||
      !text(value.scene, 255) || value.scene.includes("/") || !scenes.has(value.scene) ||
      !text(value.houdini, 24) || !/^\d+\.\d+\.\d+$/.test(value.houdini) ||
      !Array.isArray(value.tools) || value.tools.length > 100 || new Set(value.tools).size !== value.tools.length ||
      !value.tools.every((slug: unknown) => text(slug, 80) && /^[a-z0-9][a-z0-9_-]*$/.test(slug)) ||
      !Array.isArray(value.warnings) || value.warnings.length > 200 ||
      !value.warnings.every((warning: ProjectManifest["warnings"][number]) =>
        warning && text(warning.type, 256) && text(warning.node, 512) && warning.node.startsWith("/"))) throw invalid();
  return value;
}

export async function buildProjectPackage(slug: string, archive: Buffer, tools: PackageEntry[], label?: string): Promise<Buffer> {
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(slug)) throw new Error("Invalid project identifier.");
  const {manifest, entries} = inspectProjectArchive(archive);
  if (manifest && manifest.slug !== slug) throw new Error("The project ZIP belongs to another project.");
  const title = manifest?.label ?? label ?? slug.split(/[_-]+/).map(word => word[0].toUpperCase() + word.slice(1)).join(" ");
  if (!title || title.length > 80 || title.includes("/") || !validProjectPath(title)) throw new Error("Choose a valid Project name.");
  const root = "Project/" + title + "/";
  const installer = await houdiniPackageEntries(Buffer.from(JSON.stringify(packageConfig)), tools);
  const projectFiles = entries.filter(entry => entry.name !== manifestName).map(entry => ({...entry, name: root + entry.name}));
  const scene = manifest?.scene ?? entries.find(entry => /\.hip(?:lc|nc)?$/i.test(entry.name))!.name;
  const instructions = "Install QATools.json and the QATools folder following https://www.qatools.org/install.\n"
    + "Move the " + root.slice(0, -1) + " folder to your chosen working location, keeping its contents together.\n"
    + "Restart Houdini and open " + scene + " from that folder. Activate your account if needed.\n";
  return makePackageZip([...installer, ...projectFiles, {name:"PROJECT-README.txt", bytes:Buffer.from(instructions)}], root);
}

export function validateProjectArchive(bytes: Buffer): ProjectManifest | null {
  return inspectProjectArchive(bytes).manifest;
}

// Validate and decompress each bounded entry once. Every resource is kept under
// the project's own directory in the final customer package.
function inspectProjectArchive(bytes: Buffer): {manifest: ProjectManifest | null; entries: PackageEntry[]} {
  if (bytes.length > PROJECT_UPLOAD_LIMIT || !validToolZip(bytes)) throw new Error("Choose a valid project ZIP smaller than 4 MB.");
  let end = bytes.length - 22;
  while (end >= 0 && (bytes.readUInt32LE(end) !== 0x06054b50 || end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length)) end--;
  const offset = bytes.readUInt32LE(end + 16), count = bytes.readUInt16LE(end + 10);
  const seen = new Set<string>(), ranges: {start:number;end:number}[] = [];
  const scenes = new Set<string>();
  const entries: PackageEntry[] = [];
  let cursor = offset, total = 0, manifest: Buffer | null = null;
  for (let i = 0; i < count; i++) {
    const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10);
    const compressed = bytes.readUInt32LE(cursor + 20), length = bytes.readUInt32LE(cursor + 24), local = bytes.readUInt32LE(cursor + 42);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8").replaceAll("\\", "/");
    const parts = name.replace(/\/$/, "").split("/");
    if (seen.has(name.toLowerCase()) || !validProjectPath(name.replace(/\/$/, ""))
      || parts.some(p => /^qatools(?:\.json)?$/i.test(p) || /^qatools_licensing$/i.test(p)) || /\.(?:hda(?:lc|nc)?|shelf)$/i.test(name)
      || (flags & ~0x80e) !== 0 || (method === 0 && (flags & 6) !== 0) || ![0,8].includes(method) || bytes.readUInt16LE(cursor + 34) !== 0
      || length > 20 * 1024 * 1024 || (total += length) > 20 * 1024 * 1024)
      throw new Error("Project ZIP contains duplicate, unsafe, installer or oversized entries. Upload project files separately from tools.");
    if (name.toLowerCase() === manifestName && (name !== manifestName || length > 65536)) throw new Error("Invalid project manifest entry.");
    seen.add(name.toLowerCase());
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28), finish = start + compressed;
    if (finish > offset || bytes.readUInt16LE(local + 6) !== flags || bytes.readUInt16LE(local + 8) !== method || ranges.some(r => local < r.end && finish > r.start)) throw new Error("Invalid project ZIP entry bounds.");
    let entryEnd = finish;
    if (flags & 8) {
      const descriptor = finish + (finish + 4 <= offset && bytes.readUInt32LE(finish) === 0x08074b50 ? 4 : 0);
      entryEnd = descriptor + 12;
      if (entryEnd > offset || bytes.readUInt32LE(descriptor) !== bytes.readUInt32LE(cursor + 16) || bytes.readUInt32LE(descriptor + 4) !== compressed || bytes.readUInt32LE(descriptor + 8) !== length) throw new Error("Invalid project ZIP data descriptor.");
    }
    if (ranges.some(r => local < r.end && entryEnd > r.start)) throw new Error("Overlapping project ZIP entries.");
    ranges.push({start:local,end:entryEnd});
    if (!(flags & 8) && (bytes.readUInt32LE(local + 14) !== bytes.readUInt32LE(cursor + 16) || bytes.readUInt32LE(local + 18) !== compressed || bytes.readUInt32LE(local + 22) !== length)) throw new Error("Inconsistent project ZIP entry.");
    const payload = bytes.subarray(start, finish), data = method === 0 ? payload : inflateRawSync(payload, {maxOutputLength:Math.max(1,length)});
    if (data.length !== length || crc32(data) !== bytes.readUInt32LE(cursor + 16) || (name.endsWith("/") && length !== 0)) throw new Error("Corrupt project ZIP entry.");
    if (/\.hip(?:lc|nc)?$/i.test(name) && length > 0) scenes.add(name);
    if (name === manifestName) manifest = data;
    entries.push({name, bytes: data});
    cursor += 46 + nameLength + bytes.readUInt16LE(cursor + 30) + bytes.readUInt16LE(cursor + 32);
  }
  for (const name of seen) {
    const parts = name.replace(/\/$/, "").split("/");
    for (let i = 1; i < parts.length; i++) if (seen.has(parts.slice(0,i).join("/"))) throw new Error("Project ZIP has conflicting file and folder paths.");
  }
  if (!scenes.size) throw new Error("Include a Houdini HIP, HIPLC or HIPNC scene in the project ZIP.");
  return {manifest: manifest ? readManifest(manifest, scenes) : null, entries};
}
