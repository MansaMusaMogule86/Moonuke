"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Symbol } from "@/components/brand/Symbol";
import { Reveal } from "@/components/ui/Reveal";
import { ease } from "@/lib/tokens";

const ALIASES = ["Nocturne", "Velvet Hour", "Satellite", "The Quiet One", "Umbra", "Amber Room"];

/**
 * Privacy — the pseudonymous member card. Creators see the alias; Moonuke
 * keeps the legal identity and payment records private and separate.
 */
export function Privacy() {
  const [i, setI] = useState(0);
  const alias = ALIASES[i % ALIASES.length];

  return (
    <section id="privacy" aria-labelledby="privacy-title" className="relative overflow-hidden border-t border-line py-28 md:py-40">
      <div className="mx-auto grid max-w-[1600px] items-center gap-16 px-5 md:grid-cols-12 md:px-10">
        <div className="relative order-2 md:order-1 md:col-span-6">
          {/* The card */}
          <Reveal>
            <div className="relative mx-auto aspect-[1.586] w-full max-w-[520px] [perspective:1200px]">
              <motion.div
                whileHover={{ rotateX: 6, rotateY: -8 }}
                transition={{ type: "spring", stiffness: 160, damping: 18 }}
                className="relative h-full w-full overflow-hidden rounded-[26px] border border-gold/30 bg-[linear-gradient(140deg,#1a1712_0%,#0b0a08_45%,#14110c_100%)] p-7 shadow-[0_40px_120px_-40px_rgb(214_181_109/0.35)] md:p-9"
              >
                <div aria-hidden className="absolute -right-16 -top-16 h-56 w-56 rounded-full border border-gold/15" />
                <div aria-hidden className="absolute -right-6 -top-6 h-36 w-36 rounded-full border border-gold/10" />
                <div className="relative flex h-full flex-col justify-between">
                  <div className="flex items-start justify-between">
                    <Symbol size={40} />
                    <p className="eyebrow text-[10px] text-gold-muted">Member · No. 0417</p>
                  </div>
                  <div>
                    <p className="eyebrow mb-2 text-[10px] text-ash">Known in the Circle as</p>
                    <div className="h-[1.2em] overflow-hidden font-display text-[38px] italic leading-none md:text-[48px]">
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.p
                          key={alias}
                          className="text-metal"
                          initial={{ y: "100%", opacity: 0 }}
                          animate={{ y: "0%", opacity: 1 }}
                          exit={{ y: "-100%", opacity: 0 }}
                          transition={{ duration: 0.6, ease: ease.out }}
                          aria-live="polite"
                        >
                          {alias}
                        </motion.p>
                      </AnimatePresence>
                    </div>
                    <div className="mt-6 flex items-end justify-between text-[11px] uppercase tracking-[0.22em] text-ash">
                      <span>Legal name · <span className="text-stone">Private</span></span>
                      <span>Since 2026</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </Reveal>
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => setI((v) => v + 1)}
              className="rounded-full px-4 py-2 text-[13px] text-stone underline decoration-line-strong underline-offset-4 transition-colors hover:text-gold-soft"
            >
              Try another alias
            </button>
          </div>
        </div>

        <Reveal delay={0.1} className="order-1 md:order-2 md:col-span-5 md:col-start-8">
          <p className="eyebrow mb-6">IV — Privacy</p>
          <h2 id="privacy-title" className="font-display text-[44px] leading-[1.02] tracking-[-0.02em] text-ivory md:text-[72px]">
            Be known by <em className="text-metal">the name you choose.</em>
          </h2>
          <p className="mt-6 text-[17px] leading-relaxed text-stone">
            Members appear to creators only by alias. Your legal identity and payment details are held
            privately — used for age verification, billing, and the law, and nothing else.
          </p>
          <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8">
            {[
              ["Alias-first", "Creators see your alias and tier — never your name or card."],
              ["Discreet billing", "A neutral statement descriptor on every charge."],
              ["Your controls", "Block, report, hide activity, or leave in a tap."],
              ["Adults only", "Every account is age-verified before entry."],
            ].map(([t, d]) => (
              <div key={t}>
                <dt className="font-display text-[20px] text-ivory">{t}</dt>
                <dd className="mt-2 text-[14px] leading-relaxed text-stone">{d}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}
