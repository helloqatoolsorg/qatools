import "server-only";
export function imageFormat(bytes: Uint8Array): "png" | "jpg" | "webp" | "gif" | null {
  const b = Buffer.from(bytes);
  if (b.length >= 24 && b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && b.toString("ascii",12,16) === "IHDR" && b.readUInt32BE(16) > 0 && b.readUInt32BE(20) > 0 && b.readUInt32BE(16) <= 8192 && b.readUInt32BE(20) <= 8192) return "png";
  if (b.length >= 4 && b[0] === 255 && b[1] === 216 && b[2] === 255 && b[b.length-2] === 255 && b[b.length-1] === 217) return "jpg";
  if (b.length >= 16 && b.toString("ascii",0,4) === "RIFF" && b.toString("ascii",8,12) === "WEBP" && b.readUInt32LE(4) + 8 === b.length) return "webp";
  if (b.length >= 14 && ["GIF87a","GIF89a"].includes(b.toString("ascii",0,6)) && b.readUInt16LE(6)>0 && b.readUInt16LE(8)>0 && b.readUInt16LE(6)<=4096 && b.readUInt16LE(8)<=4096 && b[b.length-1]===0x3b) return "gif";
  return null;
}
