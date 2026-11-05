"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { Symbol } from "@/components/brand/Symbol";
import { Button } from "@/components/ui/Button";
import { Portrait } from "@/components/ui/Portrait";
import { Reveal } from "@/components/ui/Reveal";
import { showcase } from "@/lib/content/creators";
import { ease } from "@/lib/tokens";

const pillars = [
  ["Publish", "Posts, drops, and schedules from one composer. Lock anything to Members, VIP, or a price."],
  ["Blasts", "Message a segment — new members, top fans, lapsed VIPs — with optional paid unlocks."],
  ["Earnings", "A ledger you can read: gross, fees, net, and what is eligible for payout today."],
  ["Protection", "Verified identity, two-factor sign-in, geo-blocking, and takedown support."],
];

// Illustrative series for the preview chart (not real data).
const series = [12, 18, 15, 22, 28, 24, 33, 38, 35, 44, 52, 49, 61, 68];

export function ForCreators() {
  return (
    <section id="creators" aria-labelledby="creators-title" className="relative overflow-hidden border-t border-line bg-ink-2 py-28 md:py-40">
      <div className="mx-auto grid max-w-[1600px] gap-20 px-5 md:grid-cols-12 md:px-10">
        <div className="md:col-span-6">
          <Reveal>
            <p className="eyebrow mb-6">V — For Creators</p>
            <h2 id="creators-title" className="font-display text-[44px] leading-[1.02] tracking-[-0.02em] text-ivory md:text-[80px]">
              Run an empire <em className="text-metal">from one hand.</em>
            </h2>
            <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-stone">
              The studio is built for your phone first. Publish, message, and see what you have earned —
              without a single screen you have to squint at.
            </p>
          </Reveal>
          <div className="mt-14 grid gap-x-10 gap-y-10 sm:grid-cols-2">
            {pillars.map(([t, d], i) => (
              <Reveal key={t} delay={i * 0.08}>
                <div className="border-t border-line-strong pt-6">
                  <p className="flex items-baseline gap-3">
                    <span className="font-display text-[13px] italic text-gold">0{i + 1}</span>
                    <span className="font-display text-[26px] text-ivory">{t}</span>
                  </p>
                  <p className="mt-3 text-[14px] leading-relaxed text-stone">{d}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={0.2} className="mt-14 flex flex-wrap gap-3">
            <Button href="#top" size="lg" arrow>
              Apply as a creator
            </Button>
            <Button href="#privacy" size="lg" variant="outline">
              How verification works
            </Button>
          </Reveal>
        </div>

        <div className="relative md:col-span-5 md:col-start-8">
          <Phone />
        </div>
      </div>
    </section>
  );
}

function Phone() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-15% 0px" });
  const max = Math.max(...series);
  const pts = series.map((v, i) => `${(i / (series.length - 1)) * 100},${40 - (v / max) * 34}`).join(" ");

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 60, rotate: -2 }}
      animate={inView ? { opacity: 1, y: 0, rotate: 0 } : undefined}
      transition={{ duration: 1.3, ease: ease.out }}
      className="relative mx-auto w-full max-w-[360px]"
      role="img"
      aria-label="Preview of the Moonuke creator studio on a phone: balance, revenue trend, a Blast in progress, and top fans."
    >
      <div aria-hidden className="absolute -inset-10 rounded-full bg-[radial-gradient(closest-side,rgb(214_181_109/0.14),transparent)]" />
      <div aria-hidden className="relative rounded-[48px] border border-line-strong bg-ink p-3 shadow-[0_60px_120px_-40px_rgb(0_0_0/0.9)]">
        <div className="overflow-hidden rounded-[38px] border border-line bg-ink-2">
          {/* status */}
          <div className="flex items-center justify-between px-6 pt-4 text-[11px] text-stone">
            <span className="tabular-nums">9:41</span>
            <span className="h-5 w-20 rounded-full bg-ink" />
            <span>●●●</span>
          </div>
          <div className="px-5 pb-6 pt-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Symbol size={22} />
                <span className="text-[13px] text-stone">Studio</span>
              </div>
              <div className="h-8 w-8 overflow-hidden rounded-full border border-gold/40">
                <Portrait alt="" study={showcase[0].study} className="h-full w-full" />
              </div>
            </div>

            <p className="eyebrow mt-7 text-[9.5px] text-stone">Available balance</p>
            <p className="mt-1 font-display text-[44px] leading-none text-ivory">
              $18,420<span className="text-[24px] text-stone">.60</span>
            </p>
            <p className="mt-2 text-[12px] text-success">+12.4% vs last 30 days</p>

            <svg viewBox="0 0 100 42" className="mt-5 h-24 w-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id="phone-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#d6b56d" stopOpacity="0.35" />
                  <stop offset="1" stopColor="#d6b56d" stopOpacity="0" />
                </linearGradient>
              </defs>
              <motion.polygon
                points={`0,42 ${pts} 100,42`}
                fill="url(#phone-area)"
                initial={{ opacity: 0 }}
                animate={inView ? { opacity: 1 } : undefined}
                transition={{ duration: 1.2, delay: 0.9 }}
              />
              <motion.polyline
                points={pts}
                fill="none"
                stroke="#e8cc91"
                strokeWidth="0.9"
                vectorEffect="non-scaling-stroke"
                initial={{ pathLength: 0 }}
                animate={inView ? { pathLength: 1 } : undefined}
                transition={{ duration: 1.8, ease: ease.out, delay: 0.4 }}
              />
            </svg>

            <div className="mt-5 rounded-2xl border border-gold/30 bg-gold/[0.06] p-4">
              <div className="flex items-center justify-between">
                <p className="text-[13px] text-ivory">Blast · “Midnight drop”</p>
                <span className="text-[10px] uppercase tracking-[0.18em] text-gold">Sending</span>
              </div>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-ivory/10">
                <motion.div
                  className="h-full rounded-full bg-gold"
                  initial={{ width: "0%" }}
                  animate={inView ? { width: "72%" } : undefined}
                  transition={{ duration: 2.2, ease: ease.out, delay: 0.8 }}
                />
              </div>
              <p className="mt-2 text-[11px] text-stone">VIP + Top fans · 1,284 recipients</p>
            </div>

            <p className="eyebrow mt-6 text-[9.5px] text-stone">Top fans this week</p>
            <ul className="mt-3 space-y-2.5">
              {[
                ["Nocturne", "$1,240"],
                ["Velvet Hour", "$860"],
                ["Satellite", "$615"],
              ].map(([n, v], i) => (
                <li key={n} className="flex items-center justify-between text-[13px]">
                  <span className="flex items-center gap-3">
                    <span className="font-display text-[12px] italic text-gold-muted">{i + 1}</span>
                    <span className="text-ivory">{n}</span>
                  </span>
                  <span className="tabular-nums text-stone">{v}</span>
                </li>
              ))}
            </ul>
          </div>
          {/* tab bar */}
          <div className="flex justify-around border-t border-line px-4 pb-6 pt-3 text-[10px] tracking-[0.1em] text-ash">
            {["Home", "Create", "Inbox", "Earnings"].map((t, i) => (
              <span key={t} className={i === 3 ? "text-gold" : ""}>
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-5 text-center text-[12px] text-ash">Illustrative figures</p>
    </motion.div>
  );
}
