import "server-only";
export function imageFormat(bytes: Uint8Array): "png" | "jpg" | "webp" | "gif" | null {
  const b = Buffer.from(bytes);
  if (b.length >= 24 && b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && b.toString("ascii",12,16) === "IHDR" && b.readUInt32BE(16) > 0 && b.readUInt32BE(20) > 0 && b.readUInt32BE(16) <= 8192 && b.readUInt32BE(20) <= 8192) return "png";
  if (b.length >= 4 && b[0] === 255 && b[1] === 216 && b[2] === 255 && b[b.length-2] === 255 && b[b.length-1] === 217) return "jpg";
  if (b.length >= 16 && b.toString("ascii",0,4) === "RIFF" && b.toString("ascii",8,12) === "WEBP" && b.readUInt32LE(4) + 8 === b.length) return "webp";
  if (b.length >= 14 && ["GIF87a","GIF89a"].includes(b.toString("ascii",0,6)) && b.readUInt16LE(6)>0 && b.readUInt16LE(8)>0 && b.readUInt16LE(6)<=4096 && b.readUInt16LE(8)<=4096 && b[b.length-1]===0x3b) return "gif";
  return null;
}

type EbmlElement = { id: number; start: number; end: number; unknownSize: boolean };

function vintWidth(first: number) {
  for (let width = 1; width <= 8; width++) {
    if (first & (0x80 >> (width - 1))) return width;
  }
  return 0;
}

function ebmlElement(bytes: Uint8Array, offset: number, limit: number): EbmlElement | null {
  if (offset >= limit) return null;
  const idWidth = vintWidth(bytes[offset]);
  if (idWidth === 0 || idWidth > 4 || offset + idWidth >= limit) return null;
  let id = 0;
  for (let i = 0; i < idWidth; i++) id = id * 256 + bytes[offset + i];

  const sizeOffset = offset + idWidth;
  const sizeWidth = vintWidth(bytes[sizeOffset]);
  const start = sizeOffset + sizeWidth;
  if (!sizeWidth || start > limit) return null;
  const valueMask = (0x80 >> (sizeWidth - 1)) - 1;
  let size = bytes[sizeOffset] & valueMask;
  let unknownSize = size === valueMask;
  for (let i = sizeOffset + 1; i < start; i++) {
    unknownSize &&= bytes[i] === 0xff;
    size = size * 256 + bytes[i];
  }
  if (!unknownSize && (!Number.isSafeInteger(size) || size > limit - start)) return null;
  return { id, start, end: unknownSize ? limit : start + size, unknownSize };
}

function* ebmlChildren(bytes: Uint8Array, start: number, end: number) {
  for (let offset = start; offset < end;) {
    const element = ebmlElement(bytes, offset, end);
    if (!element) return;
    yield element;
    offset = element.end;
  }
}

function isWebmVideo(bytes: Buffer) {
  const header = ebmlElement(bytes, 0, bytes.length);
  if (header?.id !== 0x1a45dfa3 || header.unknownSize) return false;
  let webm = false;
  for (const field of ebmlChildren(bytes, header.start, header.end)) {
    if (field.unknownSize) return false;
    if (field.id === 0x4282) webm = bytes.toString("latin1", field.start, field.end) === "webm";
  }
  if (!webm) return false;

  for (const segment of ebmlChildren(bytes, header.end, bytes.length)) {
    if (segment.id !== 0x18538067) continue;
    let hasVideoTrack = false;
    let hasCluster = false;
    for (const element of ebmlChildren(bytes, segment.start, segment.end)) {
      if (element.id === 0x1654ae6b && !element.unknownSize) hasVideoTrack ||= containsWebmVideoTrack(bytes, element);
      if (element.id === 0x1f43b675 && element.end > element.start) hasCluster = true;
      if (hasVideoTrack && hasCluster) return true;
    }
    return false;
  }
  return false;
}

function containsWebmVideoTrack(bytes: Buffer, tracks: EbmlElement) {
  for (const track of ebmlChildren(bytes, tracks.start, tracks.end)) {
    if (track.id !== 0xae || track.unknownSize) continue;
    let video = false;
    let codec = "";
    for (const field of ebmlChildren(bytes, track.start, track.end)) {
      if (field.unknownSize) return false;
      if (field.id === 0x83 && field.end > field.start && field.end - field.start <= 8) {
        video = bytes[field.end - 1] === 1 && bytes.subarray(field.start, field.end - 1).every(value => value === 0);
      }
      if (field.id === 0x86 && field.end - field.start <= 8) codec = bytes.toString("latin1", field.start, field.end);
    }
    if (video && ["V_VP8", "V_VP9", "V_AV1"].includes(codec)) return true;
  }
  return false;
}

export function productMediaFormat(bytes: Buffer) {
  const image = imageFormat(bytes);
  if (image) return { extension: image, contentType: image === "jpg" ? "image/jpeg" : `image/${image}` };
  if (isWebmVideo(bytes)) return { extension: "webm", contentType: "video/webm" };
  return null;
}
