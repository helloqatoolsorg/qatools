import "server-only";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export async function readUpload(request: Request): Promise<Buffer | null> {
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  try {
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_UPLOAD_BYTES) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally { reader.releaseLock(); }
}

// Inspect the ZIP directory without extracting/running content or decompressing it.
// This catches broken archives, unsafe paths and obvious private runtime/config files;
// it is not a malware scan or a complete release review.
export function validToolZip(bytes: Buffer): boolean {
  if (bytes.length < 22 || bytes.readUInt32LE(0) !== 0x04034b50) return false;
  for (let end = bytes.length - 22; end >= Math.max(0, bytes.length - 65557); end--) {
    if (bytes.readUInt32LE(end) !== 0x06054b50 || end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length) continue;
    const count = bytes.readUInt16LE(end + 10), offset = bytes.readUInt32LE(end + 16), size = bytes.readUInt32LE(end + 12);
    if (bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6) || count < 1 || count > 1000 || bytes.readUInt16LE(end + 8) !== count || offset + size !== end) return false;
    let cursor = offset;
    for (let i = 0; i < count; i++) {
      if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50 || (bytes.readUInt16LE(cursor + 8) & 1)) return false;
      const length = bytes.readUInt16LE(cursor + 28), extra = bytes.readUInt16LE(cursor + 30), comment = bytes.readUInt16LE(cursor + 32);
      if (!length || cursor + 46 + length + extra + comment > end) return false;
      const name = bytes.subarray(cursor + 46, cursor + 46 + length).toString("utf8").replaceAll("\\", "/");
      if (name.startsWith("/") || name.includes(":") || name.includes("\0") || name.split("/").some(part => part === ".." || part === "." || /^\.env(?:\.|$)/i.test(part) || /^(account-v2\.json|license\.txt|.*private.*\.(pem|key))$/i.test(part))) return false;
      const local = bytes.readUInt32LE(cursor + 42);
      if (local + 30 > offset || bytes.readUInt32LE(local) !== 0x04034b50) return false;
      const localLength = bytes.readUInt16LE(local + 26), localExtra = bytes.readUInt16LE(local + 28);
      if (local + 30 + localLength + localExtra > offset || bytes.subarray(local + 30, local + 30 + localLength).toString("utf8").replaceAll("\\", "/") !== name) return false;
      // A symlink should not be distributed as an installable tool file.
      if (((bytes.readUInt32LE(cursor + 38) >>> 16) & 0xf000) === 0xa000) return false;
      cursor += 46 + length + extra + comment;
    }
    return cursor === end;
  }
  return false;
}
