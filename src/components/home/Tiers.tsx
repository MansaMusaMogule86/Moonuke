"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { tiers, type Tier } from "@/lib/content/creators";
import { cn } from "@/lib/cn";
import { ease } from "@/lib/tokens";

/**
 * Degrees of closeness — three tiers presented like a jewellery collection:
 * a numeral, a ring that grows brighter, and a short promise.
 */
export function Tiers() {
  const [focus, setFocus] = useState<Tier["key"]>("vip");

  return (
    <section id="tiers" aria-labelledby="tiers-title" className="relative overflow-hidden border-y border-line bg-ink-2 py-28 md:py-40">
      <div aria-hidden className="pointer-events-none absolute -right-[20vw] top-0 h-[60vw] w-[60vw] rounded-full bg-[radial-gradient(closest-side,rgb(214_181_109/0.08),transparent)]" />
      <div className="relative mx-auto max-w-[1600px] px-5 md:px-10">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="eyebrow mb-6">II — Membership</p>
          <h2 id="tiers-title" className="font-display text-[44px] leading-[1.02] tracking-[-0.02em] text-ivory md:text-[80px]">
            Three degrees of <em className="text-metal">closeness</em>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-[17px] text-stone">
            Each creator sets their own rooms and prices. You choose how near you want to be — and you can
            step back at any time, in two taps.
          </p>
        </Reveal>

        <ol className="mt-20 grid gap-4 md:mt-28 md:grid-cols-3 md:gap-6" role="list">
          {tiers.map((t, i) => {
            const isFocus = focus === t.key;
            const isVip = t.key === "vip";
            return (
                <motion.li
                  key={t.key}
                  initial={{ opacity: 0, y: 28 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "0px 0px -12% 0px" }}
                  transition={{ duration: 1, ease: ease.out, delay: i * 0.1 }}
                  onMouseEnter={() => setFocus(t.key)}
                  onFocus={() => setFocus(t.key)}
                  className={cn(
                    "group relative flex h-full flex-col rounded-[var(--radius-xl)] border p-7 transition-[border-color,background-color] duration-[520ms] ease-lux md:p-10",
                    isFocus ? "border-gold/45 bg-ink-3" : "border-line bg-ink/40",
                  )}
                >
                  <div className="flex items-start justify-between">
                    <TierRing level={i} lit={isFocus} />
                    {/* Decorative watermark numeral — drawn as SVG so it is not read or contrast-checked as text */}
                    <svg aria-hidden viewBox="0 0 90 60" className="h-[56px] w-[84px] text-ivory/10 transition-colors duration-[520ms] group-hover:text-gold/25">
                      <text x="90" y="50" textAnchor="end" fill="currentColor" className="font-display" fontStyle="italic" fontSize="56">
                        {t.numeral}
                      </text>
                    </svg>
                  </div>
                  <h3 className={cn("mt-10 font-display text-[36px] leading-none", isVip ? "text-metal" : "text-ivory")}>{t.name}</h3>
                  <p className="mt-4 min-h-[3.2em] text-[15px] leading-relaxed text-stone">{t.promise}</p>
                  <div aria-hidden className="hairline my-8" />
                  <ul className="space-y-3 text-[14px] text-ivory/85">
                    {t.inclusions.map((inc) => (
                      <li key={inc} className="flex gap-3">
                        <span aria-hidden className={cn("mt-[9px] h-px w-3 shrink-0", isVip ? "bg-gold" : "bg-stone/60")} />
                        {inc}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-10">
                    <p className="font-display text-[28px] text-ivory">
                      {t.price}
                      <span className="ml-2 align-middle font-sans text-[12px] uppercase tracking-[0.18em] text-ash">{t.cadence}</span>
                    </p>
                    <Button href="#circle" variant={isVip ? "gold" : "outline"} className="mt-6 w-full" arrow={isVip}>
                      {isVip ? "Find your VIP room" : t.key === "member" ? "Browse memberships" : "Start following"}
                    </Button>
                  </div>
                </motion.li>
            );
          })}
        </ol>
        <p className="mt-10 text-center text-[13px] text-ash">
          Prices are set by each creator and confirmed at checkout. Payments are not yet active.
        </p>
      </div>
    </section>
  );
}

/** A ring that gains gold and a gem as the tier rises. */
function TierRing({ level, lit }: { level: number; lit: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16" aria-hidden>
      <defs>
        <linearGradient id={`tr-${level}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8a6f33" />
          <stop offset="0.45" stopColor="#f1dcaa" />
          <stop offset="1" stopColor="#a88b45" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="34" r="20" fill="none" stroke="rgb(246 240 230 / 0.14)" strokeWidth="1" />
      <motion.circle
        cx="32"
        cy="34"
        r="20"
        fill="none"
        stroke={`url(#tr-${level})`}
        strokeWidth={1 + level * 0.8}
        strokeLinecap="round"
        transform="rotate(-90 32 34)"
        initial={false}
        animate={{ pathLength: lit ? [0.34, 0.67, 1][level] : [0.12, 0.3, 0.55][level] }}
        transition={{ duration: 0.9, ease: ease.out }}
      />
      {level === 2 && (
        <motion.g initial={false} animate={{ opacity: lit ? 1 : 0.4, scale: lit ? 1 : 0.8 }} style={{ originX: "32px", originY: "14px" }}>
          <path d="M32 8 L37 14 L32 20 L27 14 Z" fill="url(#tr-2)" />
          <circle cx="32" cy="14" r="9" fill="#e8cc91" opacity="0.15" />
        </motion.g>
      )}
    </svg>
  );
}
