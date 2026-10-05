import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import config from "../../public/qatools.json";
export const packageConfig = config;
export const runtimeFiles = ["__init__.py", "client.py", "config.py", "houdini_ui.py"] as const;
export type PackageEntry = { name: string; bytes: Buffer };
export function validPackageJson(bytes: Buffer): boolean {
  if (bytes.length > 8192) return false;
  try {
    const value = JSON.parse(bytes.toString("utf8"));
    return !!value && Object.keys(value).length === 2 && Array.isArray(value.env) && value.env.length === 1
      && Object.keys(value.env[0] ?? {}).length === 1 && value.env[0].qatools === packageConfig.env[0].qatools
      && Array.isArray(value.path) && value.path.length === 1 && Object.keys(value.path[0] ?? {}).length === 1
      && value.path[0].HOUDINI_PATH === "$qatools";
  } catch { return false; }
}
export function validHda(name: string, bytes: Buffer): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.(hda|hdalc|hdanc)$/i.test(name) && bytes.length > 24 && bytes.length <= 4 * 1024 * 1024 && bytes.toString("ascii",0,4) === "INDX";
}
export function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
// Stored ZIP entries: no extraction, uploaded paths or compression-ratio hazards.
export function makePackageZip(entries: PackageEntry[]): Buffer {
  if (!entries.length || entries.length > 107 || entries.reduce((n,e) => n + e.bytes.length,0) > 25 * 1024 * 1024) throw new Error("Package exceeds limits.");
  const names = new Set<string>(), files: Buffer[] = [], directory: Buffer[] = []; let offset = 0;
  for (const entry of entries) {
    if (!/^[A-Za-z0-9_.\/-]+$/.test(entry.name) || entry.name.startsWith("/") || entry.name.split("/").some(p => !p || p === "." || p === "..") || names.has(entry.name.toLowerCase())) throw new Error("Invalid or duplicate package path.");
    names.add(entry.name.toLowerCase()); const name = Buffer.from(entry.name); const crc = crc32(entry.bytes);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50,0); local.writeUInt16LE(20,4); local.writeUInt16LE(0x800,6); local.writeUInt16LE(0x21,12); local.writeUInt32LE(crc,14); local.writeUInt32LE(entry.bytes.length,18); local.writeUInt32LE(entry.bytes.length,22); local.writeUInt16LE(name.length,26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50,0); central.writeUInt16LE(20,4); central.writeUInt16LE(20,6); central.writeUInt16LE(0x800,8); central.writeUInt16LE(0x21,14); central.writeUInt32LE(crc,16); central.writeUInt32LE(entry.bytes.length,20); central.writeUInt32LE(entry.bytes.length,24); central.writeUInt16LE(name.length,28); central.writeUInt32LE(offset,42);
    files.push(local,name,entry.bytes); directory.push(central,name); offset += local.length + name.length + entry.bytes.length;
  }
  const end = Buffer.alloc(22), central = Buffer.concat(directory); end.writeUInt32LE(0x06054b50,0); end.writeUInt16LE(entries.length,8); end.writeUInt16LE(entries.length,10); end.writeUInt32LE(central.length,12); end.writeUInt32LE(offset,16);
  return Buffer.concat([...files,central,end]);
}
export async function buildHoudiniPackage(json: Buffer, tools: { name: string; bytes: Buffer }[]): Promise<Buffer> {
  if (!validPackageJson(json) || !tools.length || tools.some(t => !validHda(t.name,t.bytes))) throw new Error("Invalid installer inputs.");
  const runtime = await Promise.all(runtimeFiles.map(async name => ({ name: "qatools/python3.13libs/qatools_licensing/" + name, bytes: await readFile(join(process.cwd(),"houdini/python/qatools_licensing",name)) })));
  const startup = await readFile(join(process.cwd(),"houdini/scripts/pythonrc.py"));
  return makePackageZip([{ name: "qatools.json", bytes: json }, ...tools.map(t => ({ name: "qatools/otls/" + t.name, bytes: t.bytes })), ...runtime, { name: "qatools/scripts/pythonrc.py", bytes: startup }]);
}
