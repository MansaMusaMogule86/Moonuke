import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Shared section heading for marketing pages: eyebrow, h2 and an optional lede. */
export function SectionHeading({ id, eyebrow, title, lede, className }: { id: string; eyebrow: string; title: ReactNode; lede?: ReactNode; className?: string }) {
  return (
    <div className={cn("mk-reveal relative max-w-[44rem]", className)}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-8 -top-6 -z-10 h-28 w-56 rounded-full bg-[radial-gradient(closest-side,rgb(216_173_82/0.11),transparent)]"
      />
      <p className="eyebrow inline-flex items-center gap-2.5 text-gold">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-pink shadow-[0_0_8px_rgb(245_42_139/0.75)]" />
        <span>{eyebrow}</span>
      </p>
      <h2 id={id} className="mt-3.5 font-display text-[clamp(2rem,4.6vw,3.5rem)] leading-[1.06] tracking-[-0.015em] text-ivory md:mt-4">
        {title}
      </h2>
      {lede && <p className="mt-4 text-[15.5px] leading-relaxed text-stone md:mt-5 md:text-[17px]">{lede}</p>}
    </div>
  );
}
