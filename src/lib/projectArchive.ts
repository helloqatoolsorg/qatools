import "server-only";
import { inflateRawSync } from "node:zlib";
import { validToolZip } from "./adminDownloadUpload";
import { crc32, houdiniPackageEntries, makePackageZip, packageConfig, type PackageEntry } from "./houdiniPackage";

export const PROJECT_UPLOAD_LIMIT = 4 * 1024 * 1024 - 8192;
export async function buildProjectPackage(slug: string, archive: Buffer, tools: PackageEntry[]): Promise<Buffer> {
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(slug)) throw new Error("Invalid project identifier.");
  validateProjectArchive(archive);
  const installer = await houdiniPackageEntries(Buffer.from(JSON.stringify(packageConfig)), tools);
  return makePackageZip([...installer, {name:"project/" + slug + ".zip",bytes:archive},
    {name:"PROJECT-README.txt",bytes:Buffer.from("Install qatools.json and the qatools folder following https://www.qatools.org/install.\nExtract project/" + slug + ".zip into a separate working folder, keeping its directory structure. Open the Houdini scene from there.\nActivate your account once to enable the included tools.\n")}]);
}
// Keep the original ZIP intact inside the release. Inspect and verify its contents
// without extracting to disk or allowing it to replace the shared tool runtime.
export function validateProjectArchive(bytes: Buffer): void {
  if (bytes.length > PROJECT_UPLOAD_LIMIT || !validToolZip(bytes)) throw new Error("Choose a valid project ZIP smaller than 4 MB.");
  let end = bytes.length - 22;
  while (end >= 0 && (bytes.readUInt32LE(end) !== 0x06054b50 || end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length)) end--;
  const offset = bytes.readUInt32LE(end + 16), count = bytes.readUInt16LE(end + 10);
  const seen = new Set<string>(), ranges: {start:number;end:number}[] = [];
  let cursor = offset, total = 0, scene = false;
  for (let i = 0; i < count; i++) {
    const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10);
    const compressed = bytes.readUInt32LE(cursor + 20), length = bytes.readUInt32LE(cursor + 24), local = bytes.readUInt32LE(cursor + 42);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8").replaceAll("\\", "/");
    const parts = name.replace(/\/$/, "").split("/");
    if (seen.has(name.toLowerCase()) || parts.some(p => !p || /[<>:"|?*\x00-\x1f\ufffd]/.test(p) || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))
      || parts.some(p => /^qatools(?:\.json)?$/i.test(p) || /^qatools_licensing$/i.test(p)) || /\.hda(?:lc|nc)?$/i.test(name)
      || (flags & ~0x80e) !== 0 || (method === 0 && (flags & 6) !== 0) || ![0,8].includes(method) || bytes.readUInt16LE(cursor + 34) !== 0
      || length > 20 * 1024 * 1024 || (total += length) > 20 * 1024 * 1024)
      throw new Error("Project ZIP contains duplicate, unsafe, installer or oversized entries. Upload project files separately from tools.");
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
    if (/\.hip(?:lc|nc)?$/i.test(name) && length > 0) scene = true;
    cursor += 46 + nameLength + bytes.readUInt16LE(cursor + 30) + bytes.readUInt16LE(cursor + 32);
  }
  for (const name of seen) {
    const parts = name.replace(/\/$/, "").split("/");
    for (let i = 1; i < parts.length; i++) if (seen.has(parts.slice(0,i).join("/"))) throw new Error("Project ZIP has conflicting file and folder paths.");
  }
  if (!scene) throw new Error("Include a Houdini HIP, HIPLC or HIPNC scene in the project ZIP.");
}
