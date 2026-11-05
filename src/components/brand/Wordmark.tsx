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
 * MOONUKE wordmark. Bodoni capitals, wide tracking; the second O is a
 * new moon — an empty, hairline circle — so the name itself contains a phase.
 */
export function Wordmark({ className, withSymbol = false, tone = "metal", decorative = false }: WordmarkProps) {
  return (
    <span aria-hidden={decorative || undefined} className={cn("inline-flex items-center gap-[0.6em] leading-none", className)}>
      {withSymbol && <Symbol size={28} className="h-[1.9em] w-[1.9em]" />}
      <span
        aria-label={decorative ? undefined : "Moonuke"}
        role={decorative ? undefined : "img"}
        className={cn(
          "font-display inline-flex items-center tracking-[0.3em] uppercase",
          tone === "metal" ? "text-metal" : "text-ivory",
        )}
        style={{ fontWeight: 500 }}
      >
        <span aria-hidden>MO</span>
        <span
          aria-hidden
          className={cn(
            "mx-[0.02em] mr-[0.32em] inline-block h-[0.72em] w-[0.72em] rounded-full border",
            tone === "metal" ? "border-gold" : "border-ivory",
          )}
          style={{ borderWidth: "max(1px, 0.075em)" }}
        />
        <span aria-hidden>NUKE</span>
      </span>
    </span>
  );
}
