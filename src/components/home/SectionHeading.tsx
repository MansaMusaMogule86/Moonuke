import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Shared section heading for marketing pages: eyebrow, h2 and an optional lede. */
export function SectionHeading({ id, eyebrow, title, lede, className }: { id: string; eyebrow: string; title: ReactNode; lede?: ReactNode; className?: string }) {
  return (
    <div className={cn("mk-reveal max-w-[44rem]", className)}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={id} className="mt-4 font-display text-[clamp(2.1rem,4.6vw,3.5rem)] leading-[1.06] tracking-[-0.015em] text-ivory">
        {title}
      </h2>
      {lede && <p className="mt-5 text-[17px] leading-relaxed text-stone">{lede}</p>}
    </div>
  );
}
