import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Portrait } from "@/components/ui/Portrait";
import { ImageReveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";
import type { CreatorCard } from "@/server/services/club";
import { formatMoney } from "@/server/payments";

const compact = (n: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

/** Editorial creator plate. `size="hero"` is the lead plate of a spread. */
export function CreatorPlate({ c, size = "plate", delay = 0 }: { c: CreatorCard; size?: "hero" | "plate"; delay?: number }) {
  const hero = size === "hero";
  return (
    <Link href={`/c/${c.handle}`} className="group block rounded-[var(--radius-lg)]">
      <ImageReveal delay={delay} className={cn("relative overflow-hidden", hero ? "aspect-[4/5] rounded-[var(--radius-xl)]" : "arch aspect-[3/4]")}>
        <Portrait alt="" study={c.cover} className="h-full w-full transition-transform duration-[1400ms] ease-lux group-hover:scale-[1.05]" />
        {c.featured && hero && (
          <div className="absolute left-4 top-4">
            <Badge tone="vip">Featured</Badge>
          </div>
        )}
        {c.tagline && (
          <div className="absolute inset-x-0 bottom-0 translate-y-3 bg-gradient-to-t from-ink via-ink/70 to-transparent p-5 pt-16 opacity-0 transition-[opacity,transform] duration-[520ms] ease-lux group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
            <p className="font-display text-[15px] italic leading-snug text-ivory/90 md:text-[17px]">“{c.tagline}”</p>
          </div>
        )}
      </ImageReveal>
      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("truncate font-display text-ivory transition-colors group-hover:text-gold-soft", hero ? "text-[30px] md:text-[40px]" : "text-[19px] md:text-[22px]")}>
            {c.display_name}
          </p>
          <p className="mt-1 truncate text-[12px] uppercase tracking-[0.18em] text-ash">
            {c.discipline}
            {c.city ? ` · ${c.city}` : ""}
          </p>
        </div>
        <div className="shrink-0 pt-1 text-right text-[12px] text-stone">
          <span className="block tabular-nums text-ivory">{compact(c.members)}</span>
          {c.members === 1 ? "member" : "members"}
        </div>
      </div>
      {c.vip_from_cents != null && (
        <p className="mt-2 text-[12px] text-stone">
          VIP from <span className="text-gold">{formatMoney({ amountCents: c.vip_from_cents, currency: c.currency ?? "USD" })}</span>
        </p>
      )}
    </Link>
  );
}
