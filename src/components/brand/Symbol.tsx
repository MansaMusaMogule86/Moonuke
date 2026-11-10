import { useId } from "react";
import { cn } from "@/lib/cn";

type SymbolProps = {
  size?: number;
  className?: string;
  /** Decorative by default. Pass a label when the mark stands alone. */
  title?: string;
};

/**
 * The Diva Fans monogram: Didone "DF" capitals inside a hairline ring.
 * Drawn as paths, not text, so it never depends on a loaded font.
 * Keep in step with app/icon.svg.
 */
export function Symbol({ size = 32, className, title }: SymbolProps) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={cn("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <defs>
        <linearGradient id={`m-${id}`} x1="4" y1="6" x2="44" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8a6f33" />
          <stop offset="0.35" stopColor="#f1dcaa" />
          <stop offset="0.6" stopColor="#d6b56d" />
          <stop offset="1" stopColor="#8a6f33" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="21.5" fill="none" stroke={`url(#m-${id})`} strokeWidth="0.9" opacity="0.7" />
      <path fill={`url(#m-${id})`} d={MONOGRAM} />
    </svg>
  );
}

/** D: stem, hairline serifs and a bowl that thickens at the waist. F: stem, hairline arms with beak serifs. */
const MONOGRAM =
  "M12.6 15h3.4v18h-3.4z M11 15h5v1.1h-5z M11 31.9h5V33h-5z " +
  "M16 15h1C21.6 15 24 19 24 24s-2.4 9-7 9h-1v-1.1h1c3.2 0 4.4-3.6 4.4-7.9S20.2 16.1 17 16.1h-1z " +
  "M28.4 15h3.4v18h-3.4z M26.8 15h10.4v1.1H26.8z M36.2 15h1v4.4h-1z M26.8 31.9h6.6V33h-6.6z M31.8 23.4h4v1.1h-4z M35.1 21.6h0.9v4.8h-0.9z";
