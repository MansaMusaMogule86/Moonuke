import { brand } from "@/config/brand";
import { cn } from "@/lib/cn";
import { Symbol } from "./Symbol";

type WordmarkProps = {
  className?: string;
  /** Show the DF monogram before the letters. */
  withSymbol?: boolean;
  /** "metal" renders the champagne gradient; "duotone" renders gold Diva + neon pink Fans; "ivory" is for small sizes. */
  tone?: "metal" | "ivory" | "duotone";
  /** Hide from assistive tech when a parent already provides the name (e.g. a logo link). */
  decorative?: boolean;
};

/**
 * Wordmark. Bodoni display typography. Letters come from src/config/brand.ts.
 */
export function Wordmark({ className, withSymbol = false, tone = "metal", decorative = false }: WordmarkProps) {
  return (
    <span aria-hidden={decorative || undefined} className={cn("inline-flex items-center gap-[0.55em] leading-none", className)}>
      {withSymbol && <Symbol size={28} className="h-[1.9em] w-[1.9em]" />}
      {tone === "duotone" ? (
        <span
          aria-label={decorative ? undefined : brand.name}
          role={decorative ? undefined : "img"}
          className="font-display inline-flex items-baseline whitespace-nowrap text-[1.35em] italic tracking-[0.02em]"
          style={{ fontWeight: 500 }}
        >
          <span aria-hidden className="text-metal">Diva</span>
          <span aria-hidden className="text-pink">Fans</span>
        </span>
      ) : (
        <span
          aria-label={decorative ? undefined : brand.name}
          role={decorative ? undefined : "img"}
          className={cn(
            "font-display inline-flex items-center whitespace-nowrap tracking-[0.3em] uppercase",
            tone === "metal" ? "text-metal" : "text-ivory",
          )}
          style={{ fontWeight: 500 }}
        >
          <span aria-hidden>{brand.wordmark.text}</span>
        </span>
      )}
    </span>
  );
}
