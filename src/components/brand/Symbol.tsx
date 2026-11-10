import Image from "next/image";
import { brand } from "@/config/brand";
import { cn } from "@/lib/cn";

type SymbolProps = {
  size?: number;
  className?: string;
  /** Decorative by default. Pass a label when the mark stands alone. */
  title?: string;
};

/**
 * The approved DF monogram (gold letters, pink flourish and diamond), cropped
 * from the official logo. The art sits on pure black, so `logo-art` blends it
 * into whatever dark surface it is placed on without changing its colours.
 */
export function Symbol({ size = 32, className, title }: SymbolProps) {
  return (
    <Image
      src={brand.monogram.src}
      width={size}
      height={size}
      alt={title ?? ""}
      aria-hidden={title ? undefined : true}
      className={cn("logo-art shrink-0", className)}
    />
  );
}
