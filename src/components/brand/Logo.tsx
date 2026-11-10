import Image from "next/image";
import { brand } from "@/config/brand";
import { cn } from "@/lib/cn";

/**
 * The full approved lockup (DF monogram over DIVA FANS). It is a stacked mark,
 * so use it where it can be at least ~88px tall; headers use the monogram plus
 * the text wordmark instead. Set the height with className; width follows.
 */
export function Logo({ className, priority, sizes = "220px" }: { className?: string; priority?: boolean; sizes?: string }) {
  return (
    <Image
      src={brand.logo.src}
      width={brand.logo.width}
      height={brand.logo.height}
      alt={brand.name}
      sizes={sizes}
      priority={priority}
      className={cn("logo-art h-24 w-auto", className)}
    />
  );
}
