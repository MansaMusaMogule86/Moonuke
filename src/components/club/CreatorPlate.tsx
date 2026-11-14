import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Portrait } from "@/components/ui/Portrait";
import { ImageReveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";
import type { CreatorCard } from "@/server/services/club";
import { formatMoney } from "@/server/payments";

const compact = (n: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

/** Editorial creator card for Explore and recommendations. */
export function CreatorPlate({ c, size = "plate", delay = 0 }: { c: CreatorCard; size?: "hero" | "plate"; delay?: number }) {
  const hero = size === "hero";
  const fromCents = c.member_from_cents ?? c.vip_from_cents;
  const fromLabel =
    fromCents != null ? formatMoney({ amountCents: fromCents, currency: c.currency ?? "USD" }) : null;

  return (
    <Link href={`/c/${c.handle}`} className="group block rounded-[var(--radius-lg)]">
      <ImageReveal delay={delay} className={cn("relative overflow-hidden", hero ? "aspect-[4/5] rounded-[var(--radius-xl)]" : "arch aspect-[3/4]")}>
        <Portrait alt={c.display_name} study={c.cover} className="h-full w-full transition-transform duration-[1400ms] ease-lux group-hover:scale-[1.05]" />
        {c.featured && hero && (
          <div className="absolute left-4 top-4">
            <Badge tone="vip">Featured</Badge>
          </div>
        )}
      </ImageReveal>
      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("truncate font-display text-ivory transition-colors group-hover:text-gold-soft", hero ? "text-[30px] md:text-[40px]" : "text-[19px] md:text-[22px]")}>
            {c.display_name}
          </p>
          <p className="mt-0.5 truncate text-[12px] text-stone">
            @{c.handle} · <span className="uppercase tracking-[0.14em] text-ash">{c.discipline}{c.city ? ` · ${c.city}` : ""}</span>
          </p>
        </div>
        <div className="shrink-0 pt-1 text-right text-[12px] text-stone">
          <span className="block tabular-nums text-ivory">{compact(c.members)}</span>
          {c.members === 1 ? "member" : "members"}
        </div>
      </div>
      {c.tagline && (
        <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-stone">
          {c.tagline}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5">
        {fromLabel ? (
          <p className="text-[12px] text-stone">
            Subscribe from <span className="font-medium text-gold-soft">{fromLabel}/mo</span>
          </p>
        ) : (
          <p className="text-[12px] text-ash">Creator profile</p>
        )}
        <span className="inline-flex items-center gap-1 rounded-full border border-line-strong px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-ivory transition-colors group-hover:border-gold/50 group-hover:text-gold-soft">
          View profile →
        </span>
      </div>
    </Link>
  );
}
