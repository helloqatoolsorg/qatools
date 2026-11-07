import type { ComponentPropsWithRef } from "react";

type Props = Omit<ComponentPropsWithRef<"video">, "autoPlay" | "loop" | "muted" | "playsInline" | "controls"> & {
  lazy?: boolean;
};

export default function LoopingProductVideo({ lazy, ...props }: Props) {
  const loading = lazy ? { loading: "lazy" } : {};
  return <video {...props} {...loading} autoPlay loop muted playsInline />;
}
