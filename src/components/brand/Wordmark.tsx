import { brand } from "@/config/brand";
import { cn } from "@/lib/cn";
import { Symbol } from "./Symbol";

type WordmarkProps = {
  className?: string;
  /** Show the Diamond Ring symbol before the letters. */
  withSymbol?: boolean;
  /** "metal" renders the champagne gradient; "ivory" is for small sizes. */
  tone?: "metal" | "ivory";
  /** Hide from assistive tech when a parent already provides the name (e.g. a logo link). */
  decorative?: boolean;
};

/**
 * Wordmark. Bodoni capitals, wide tracking. The letter at `brand.wordmark.moonIndex`
 * is drawn as a new moon — a hairline circle — so the name itself contains a phase.
 * Letters come from src/config/brand.ts.
 */
export function Wordmark({ className, withSymbol = false, tone = "metal", decorative = false }: WordmarkProps) {
  const { text, moonIndex } = brand.wordmark;
  const before = moonIndex == null ? text : text.slice(0, moonIndex);
  const after = moonIndex == null ? "" : text.slice(moonIndex + 1);
  return (
    <span aria-hidden={decorative || undefined} className={cn("inline-flex items-center gap-[0.6em] leading-none", className)}>
      {withSymbol && <Symbol size={28} className="h-[1.9em] w-[1.9em]" />}
      <span
        aria-label={decorative ? undefined : brand.name}
        role={decorative ? undefined : "img"}
        className={cn("font-display inline-flex items-center tracking-[0.3em] uppercase", tone === "metal" ? "text-metal" : "text-ivory")}
        style={{ fontWeight: 500 }}
      >
        <span aria-hidden>{before}</span>
        {moonIndex != null && (
          <span
            aria-hidden
            className={cn("mx-[0.02em] mr-[0.32em] inline-block h-[0.72em] w-[0.72em] rounded-full border", tone === "metal" ? "border-gold" : "border-ivory")}
            style={{ borderWidth: "max(1px, 0.075em)" }}
          />
        )}
        {after && <span aria-hidden>{after}</span>}
      </span>
    </span>
  );
}
