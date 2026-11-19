import "server-only";
import { readFile } from "node:fs/promises";
import { deflateRawSync } from "node:zlib";
import { join } from "node:path";
import config from "../../public/QATools.json";
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
export function validShelfTool(name: string, bytes: Buffer): boolean {
  const stem = /^([A-Za-z]+(?:_[A-Za-z]+)*)\.shelf$/.exec(name)?.[1];
  if (!stem || stem.length > 80 || bytes.length > 4 * 1024 * 1024) return false;
  const xml = bytes.toString("utf8");
  const id = "qatools_shelf_" + stem.toLowerCase();
  const label = stem.replaceAll("_", " ");
  const prefix = "<shelfDocument><toolshelf name=\"" + id + "\" label=\"" + label +
    "\"><memberTool name=\"" + id + "\" /></toolshelf><tool name=\"" + id + "\" label=\"" + label + "\" icon=\"";
  const wrapper = /^(?:<\?xml version='1\.0' encoding='utf-8'\?>\r?\n)?([^]*)$/.exec(xml)?.[1];
  if (!wrapper?.startsWith(prefix)) return false;
  return /^[A-Za-z0-9_]+"><helpText>Shift-click for license information\.<\/helpText><script scriptType="python">[^<]+<\/script><\/tool><\/shelfDocument>$/.test(wrapper.slice(prefix.length))
    && wrapper.includes("from qatools_licensing.houdini_ui import run_shelf_tool");
}

export function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
export function validProjectPath(name: string): boolean {
  return Buffer.byteLength(name, "utf8") <= 512 && name.split("/").every(part =>
    part.length > 0 && part !== "." && part !== ".." &&
    !/[<>:"|?*\\\x00-\x1f\ufffd]/.test(part) && !/[. ]$/.test(part) &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));
}

// Tool/runtime entries stay stored. Validated project files are compressed under
// their own root so spaces and resource filenames cannot affect installer paths.
export function makePackageZip(entries: PackageEntry[], projectRoot?: string): Buffer {
  if (projectRoot && (!projectRoot.startsWith("Project/") || !projectRoot.endsWith("/") ||
      projectRoot.split("/").length !== 3 || !validProjectPath(projectRoot.slice(0, -1)))) {
    throw new Error("Invalid project folder.");
  }
  const limit = projectRoot ? 1113 : 113;
  if (!entries.length || entries.length > limit || entries.reduce((n,e) => n + e.bytes.length,0) > 25 * 1024 * 1024) throw new Error("Package exceeds limits.");
  const names = new Set<string>(), files: Buffer[] = [], directory: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const projectEntry = Boolean(projectRoot && entry.name.startsWith(projectRoot));
    const isDirectory = entry.name.endsWith("/");
    const validName = projectEntry
      ? validProjectPath(isDirectory ? entry.name.slice(0, -1) : entry.name)
      : /^[A-Za-z0-9_.\/-]+$/.test(entry.name) && !entry.name.startsWith("/") &&
        !entry.name.split("/").some(part => !part || part === "." || part === "..");
    if (!validName || (isDirectory && entry.bytes.length !== 0) || names.has(entry.name.toLowerCase())) throw new Error("Invalid or duplicate package path.");
    names.add(entry.name.toLowerCase());
    const name = Buffer.from(entry.name), crc = crc32(entry.bytes);
    const compressed = projectEntry && !isDirectory;
    const payload = compressed ? deflateRawSync(entry.bytes) : entry.bytes;
    const method = compressed ? 8 : 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0);
    local.writeUInt16LE(20,4);
    local.writeUInt16LE(0x800,6);
    local.writeUInt16LE(method,8);
    local.writeUInt16LE(0x21,12);
    local.writeUInt32LE(crc,14);
    local.writeUInt32LE(payload.length,18);
    local.writeUInt32LE(entry.bytes.length,22);
    local.writeUInt16LE(name.length,26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50,0);
    central.writeUInt16LE(20,4);
    central.writeUInt16LE(20,6);
    central.writeUInt16LE(0x800,8);
    central.writeUInt16LE(method,10);
    central.writeUInt16LE(0x21,14);
    central.writeUInt32LE(crc,16);
    central.writeUInt32LE(payload.length,20);
    central.writeUInt32LE(entry.bytes.length,24);
    central.writeUInt16LE(name.length,28);
    central.writeUInt32LE(offset,42);
    files.push(local,name,payload);
    directory.push(central,name);
    offset += local.length + name.length + payload.length;
  }
  const end = Buffer.alloc(22), central = Buffer.concat(directory);
  end.writeUInt32LE(0x06054b50,0);
  end.writeUInt16LE(entries.length,8);
  end.writeUInt16LE(entries.length,10);
  end.writeUInt32LE(central.length,12);
  end.writeUInt32LE(offset,16);
  return Buffer.concat([...files,central,end]);
}
export async function sharedHoudiniRuntimeEntries(json:Buffer):Promise<PackageEntry[]> {
  if(!validPackageJson(json))throw Error("Invalid package configuration.");
  const runtime=await Promise.all(runtimeFiles.map(async name=>({name:"QATools/python3.13libs/qatools_licensing/"+name,bytes:await readFile(join(process.cwd(),"houdini/python/qatools_licensing",name))})));
  const common=runtime.map((entry,index)=>({name:"QATools/scripts/python/qatools_licensing/"+runtimeFiles[index],bytes:entry.bytes}));
  const startup=await readFile(join(process.cwd(),"houdini/scripts/pythonrc.py"));
  return [{name:"QATools.json",bytes:json},...runtime,...common,{name:"QATools/scripts/pythonrc.py",bytes:startup}];
}
export async function houdiniPackageEntries(json: Buffer, tools: { name: string; bytes: Buffer }[]): Promise<PackageEntry[]> {
  if (!tools.length || tools.length > 100 || tools.some(t => !validHda(t.name,t.bytes) && !validShelfTool(t.name,t.bytes))) throw new Error("Invalid installer inputs.");
  const runtime=await sharedHoudiniRuntimeEntries(json);
  return [...runtime,...tools.map(tool=>({name:"QATools/"+(tool.name.endsWith(".shelf")?"toolbar/":"otls/")+tool.name,bytes:tool.bytes}))];
}

export async function buildHoudiniPackage(json: Buffer, tools: PackageEntry[]): Promise<Buffer> {
  return makePackageZip(await houdiniPackageEntries(json, tools));
}
