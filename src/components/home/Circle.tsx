import { Badge } from "@/components/ui/Badge";
import { Portrait } from "@/components/ui/Portrait";
import { ImageReveal, Reveal } from "@/components/ui/Reveal";
import { showcase } from "@/lib/content/creators";
import { cn } from "@/lib/cn";

/**
 * The Circle — featured creators as an editorial spread, not a card grid.
 * Five plates on a broken 12-column grid; each offset like a magazine layout.
 */
const layout = [
  "md:col-span-5 md:row-span-2",
  "md:col-span-3 md:col-start-7 md:mt-24",
  "md:col-span-3 md:col-start-10",
  "md:col-span-3 md:col-start-7",
  "md:col-span-3 md:col-start-10 md:-mt-16",
];

export function Circle() {
  return (
    <section id="circle" aria-labelledby="circle-title" className="relative mx-auto max-w-[1600px] px-5 py-28 md:px-10 md:py-40">
      <div className="mb-16 grid gap-8 md:mb-24 md:grid-cols-12">
        <Reveal className="md:col-span-7">
          <p className="eyebrow mb-6">I — The Circle</p>
          <h2 id="circle-title" className="font-display text-[44px] leading-[1.02] tracking-[-0.02em] text-ivory md:text-[88px]">
            Not everyone <em className="text-metal">gets in.</em>
            <br className="hidden md:block" /> That is the point.
          </h2>
        </Reveal>
        <Reveal delay={0.15} className="md:col-span-4 md:col-start-9 md:self-end">
          <p className="text-[17px] leading-relaxed text-stone">
            Every Moonuke creator is invited, verified, and reviewed by a person. You won&apos;t find ten
            million accounts here — only the ones worth knowing well.
          </p>
        </Reveal>
      </div>

      <ul className="grid grid-cols-2 gap-x-3 gap-y-10 md:grid-cols-12 md:gap-x-6 md:gap-y-12">
        {showcase.map((c, i) => (
          <li key={c.handle} className={cn(i === 0 ? "col-span-2" : "col-span-1", layout[i])}>
            <a href="#tiers" className="group block">
              <ImageReveal
                delay={i * 0.08}
                className={cn(
                  "relative overflow-hidden",
                  i === 0 ? "aspect-[4/5] rounded-[var(--radius-xl)]" : "arch aspect-[3/4]",
                )}
              >
                <Portrait
                  alt=""
                  study={c.study}
                  className="h-full w-full transition-transform duration-[1400ms] ease-lux group-hover:scale-[1.05]"
                  sizes={i === 0 ? "(max-width: 768px) 100vw, 40vw" : "(max-width: 768px) 50vw, 25vw"}
                />
                <div className="absolute left-4 top-4 flex gap-2 md:left-5 md:top-5">
                  {i === 0 && <Badge tone="vip">Featured</Badge>}
                </div>
                {/* hover veil: line from the creator */}
                <div className="absolute inset-x-0 bottom-0 translate-y-3 bg-gradient-to-t from-ink via-ink/70 to-transparent p-5 pt-16 opacity-0 transition-[opacity,transform] duration-[520ms] ease-lux group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
                  <p className="font-display text-[15px] italic leading-snug text-ivory/90 md:text-[17px]">“{c.line}”</p>
                </div>
              </ImageReveal>
              <div className="mt-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={cn("font-display text-ivory transition-colors group-hover:text-gold-soft", i === 0 ? "text-[30px] md:text-[40px]" : "text-[19px] md:text-[22px]")}>
                    {c.name}
                  </p>
                  <p className="mt-1 text-[12px] uppercase tracking-[0.18em] text-ash">
                    {c.discipline} · {c.city}
                  </p>
                </div>
                <p className="shrink-0 pt-1 text-right text-[12px] text-stone">
                  <span className="block tabular-nums text-ivory">{c.members}</span>members
                </p>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
