const mediaTypes = ["video/webm", "image/png", "image/jpeg", "image/webp", "image/gif"];

export const productMediaAccept = [".webm", ...mediaTypes].join(",");
export const productMediaFileHelp = "Choose a WebM, PNG, JPG, WebP or GIF up to 4 MB.";

export function isWebmSource(src: string, file?: Pick<File, "type" | "name">) {
  if (file?.type === "video/webm") return true;
  return (file?.name ?? src.split(/[?#]/, 1)[0]).toLowerCase().endsWith(".webm");
}

export function validProductMediaFile(file: File) {
  return file.size > 0 && file.size <= 4 * 1024 * 1024
    && (mediaTypes.includes(file.type)
      || ((!file.type || file.type === "application/octet-stream") && isWebmSource("", file)));
}
