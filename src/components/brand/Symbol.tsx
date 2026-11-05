import { useId } from "react";
import { cn } from "@/lib/cn";

type SymbolProps = {
  size?: number;
  className?: string;
  /** Decorative by default. Pass a label when the mark stands alone. */
  title?: string;
};

/**
 * The MOONUKE symbol — "the Diamond Ring".
 * A total eclipse at the instant of second contact: a dark moon, a thin
 * corona, and one point of light. Private, rare, and only for a moment.
 */
export function Symbol({ size = 32, className, title }: SymbolProps) {
  const id = useId().replace(/:/g, "");
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
        <radialGradient id={`g-${id}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff6df" />
          <stop offset="0.35" stopColor="#e8cc91" stopOpacity="0.9" />
          <stop offset="1" stopColor="#d6b56d" stopOpacity="0" />
        </radialGradient>
        <mask id={`c-${id}`}>
          <circle cx="24" cy="24" r="17" fill="white" />
          <circle cx="26.6" cy="21.6" r="16.2" fill="black" />
        </mask>
      </defs>
      {/* corona ring */}
      <circle cx="24" cy="24" r="21.5" fill="none" stroke={`url(#m-${id})`} strokeWidth="0.9" opacity="0.7" />
      {/* lit crescent */}
      <circle cx="24" cy="24" r="17" fill={`url(#m-${id})`} mask={`url(#c-${id})`} />
      {/* the diamond */}
      <circle cx="11.2" cy="34.6" r="5.2" fill={`url(#g-${id})`} />
      <circle cx="11.2" cy="34.6" r="1.25" fill="#fffaf0" />
    </svg>
  );
}
