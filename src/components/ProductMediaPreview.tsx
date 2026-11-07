import Image from "next/image";
import LoopingProductVideo from "@/components/LoopingProductVideo";
import { isWebmSource } from "@/lib/productMediaInput";

export default function ProductMediaPreview({ src, alt, width, height, file, eager = false }: {
  src: string;
  alt: string;
  width: number;
  height: number;
  file?: File;
  eager?: boolean;
}) {
  return isWebmSource(src, file)
    ? <LoopingProductVideo src={src} aria-label={alt || undefined} aria-hidden={!alt}
        width={width} height={height} lazy={!eager} />
    : <Image src={src} alt={alt} width={width} height={height} unoptimized loading={eager ? "eager" : "lazy"} />;
}
