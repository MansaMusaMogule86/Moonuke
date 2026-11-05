"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Portrait } from "@/components/ui/Portrait";
import { Segmented } from "@/components/ui/Segmented";
import { showcase } from "@/lib/content/creators";
import { ease } from "@/lib/tokens";
import { HeroCarousel } from "./HeroCarousel";

const TITLE = "Moonuke";

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const [role, setRole] = useState<"fan" | "creator">("fan");

  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const discY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 120]);
  const titleY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -60]);
  // The engraving lives inside the moving moon layer; counter-move it so it
  // stays registered with the solid title underneath.
  const engraveY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -180]);
  const fade = useTransform(scrollYProgress, [0, 0.7], [1, reduce ? 1 : 0.15]);

  const letters = TITLE.split("");

  return (
    <section ref={ref} aria-labelledby="hero-title" className="relative isolate overflow-hidden pt-20 md:min-h-[100svh]">
      {/* ambient light */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="mk-breathe absolute left-[52%] top-[6%] h-[60vw] w-[60vw] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(214_181_109/0.13),transparent)] md:h-[46vw] md:w-[46vw]" />
      </div>

      <div className="mk-stage relative mx-auto w-full max-w-[1600px]" style={{ height: "var(--art-h)" }}>
        {/* Layer 1 — the solid gold title, behind the moon */}
        <motion.div style={{ y: titleY, opacity: fade }} className="absolute inset-0">
          <h1 id="hero-title" className="mk-title" aria-label="Moonuke — the private creator club">
            {letters.map((l, i) => (
              <span key={i} aria-hidden className="inline-block overflow-hidden pb-[0.12em] align-top">
                <motion.span
                  className="text-metal inline-block"
                  style={{
                    backgroundSize: `${letters.length * 100}% 100%`,
                    backgroundPosition: `${(i / (letters.length - 1)) * 100}% 50%`,
                  }}
                  initial={{ y: "105%" }}
                  animate={{ y: "0%" }}
                  transition={{ duration: 1.25, ease: ease.out, delay: 0.25 + i * 0.065 }}
                >
                  {l}
                </motion.span>
              </span>
            ))}
          </h1>
        </motion.div>

        {/* Layer 2 — the eclipse */}
        <motion.div style={{ y: discY }} className="absolute inset-0">
          <motion.div
            className="mk-eclipse"
            initial={{ opacity: 0, scale: 0.92, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 1.6, ease: ease.out, delay: 0.05 }}
          >
            <Eclipse />
          </motion.div>

          {/* Layer 3 — the title continues across the moon as a gold engraving */}
          <motion.div className="mk-clip" aria-hidden>
            <motion.div style={{ y: engraveY }} className="absolute inset-0">
            <div className="mk-title mk-title-outline">
              {letters.map((l, i) => (
                <span key={i} className="inline-block overflow-hidden pb-[0.12em] align-top">
                  <motion.span
                    className="inline-block"
                    initial={{ y: "105%" }}
                    animate={{ y: "0%" }}
                    transition={{ duration: 1.25, ease: ease.out, delay: 0.25 + i * 0.065 }}
                  >
                    {l}
                  </motion.span>
                </span>
              ))}
            </div>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>

      {/* Copy + carousel. Overlaid on desktop, stacked on mobile. */}
      <div className="relative mx-auto grid max-w-[1600px] gap-12 px-5 pb-16 md:absolute md:inset-x-0 md:bottom-0 md:grid-cols-12 md:items-end md:px-10 md:pb-14">
        <motion.div
          className="md:col-span-5 lg:col-span-4"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: ease.out, delay: 1.05 }}
        >
          <p className="eyebrow mb-5">A private creator club · 18+</p>
          <p className="max-w-[26rem] text-[17px] leading-relaxed text-ivory/90">
            Where the most devoted audiences meet the creators they follow by name —
            and are known only by the one they choose.
          </p>

          <div className="mt-8 flex items-center gap-4">
            <span className="text-[13px] text-stone">Enter as</span>
            <Segmented
              label="Choose how you enter"
              value={role}
              onChange={setRole}
              options={[
                { value: "fan", label: "Member" },
                { value: "creator", label: "Creator" },
              ]}
            />
          </div>

          <div aria-hidden className="hairline my-8 max-w-[22rem]" />

          <div className="flex flex-wrap items-center gap-3">
            <Button href={role === "fan" ? "#tiers" : "#creators"} size="lg" arrow>
              {role === "fan" ? "Request entry" : "Apply as a creator"}
            </Button>
            <Button href="#circle" variant="quiet" size="lg">
              See the Circle
            </Button>
          </div>
        </motion.div>

        <motion.div
          className="md:col-span-5 md:col-start-8 lg:col-span-4 lg:col-start-9"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: ease.out, delay: 1.25 }}
        >
          <HeroCarousel creators={showcase} />
        </motion.div>
      </div>
    </section>
  );
}

/** The dark moon, a figure inside it, a corona, and the diamond. */
function Eclipse() {
  return (
    <div className="relative h-full w-full">
      {/* corona */}
      <div
        aria-hidden
        className="absolute -inset-[7%] rounded-full opacity-90 blur-2xl"
        style={{
          background:
            "conic-gradient(from 210deg, rgb(232 204 145 / 0.55), rgb(214 181 109 / 0.05) 22%, rgb(168 139 69 / 0.25) 48%, rgb(214 181 109 / 0.02) 70%, rgb(241 220 170 / 0.6))",
        }}
      />
      <div aria-hidden className="absolute -inset-[1.2%] rounded-full bg-[conic-gradient(from_200deg,#f1dcaa,#a88b45_25%,#2a2213_50%,#a88b45_75%,#f1dcaa)] opacity-80" />
      {/* the moon */}
      <div className="absolute inset-0 overflow-hidden rounded-full bg-ink shadow-[inset_0_0_80px_rgb(0_0_0/0.9)]">
        <Portrait
          alt="Editorial study: a figure lit by the edge of an eclipse"
          study={{ hair: "wrap", light: "left", tilt: -3, adorn: "hoops", glow: 1 }}
          className="absolute inset-x-[6%] bottom-[-22%] top-[24%] bg-transparent [mask-image:radial-gradient(ellipse_50%_55%_at_50%_45%,black_30%,transparent_96%)]"
          priority
        />
        <div aria-hidden className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_60%_40%,transparent_45%,rgb(5_5_5/0.7)_80%)]" />
      </div>
      {/* the diamond — second contact */}
      <div aria-hidden className="absolute left-[14.5%] top-[85.5%] -translate-x-1/2 -translate-y-1/2">
        <div className="mk-breathe h-14 w-14 rounded-full bg-[radial-gradient(closest-side,#fff6df,rgb(232_204_145/0.55)_35%,transparent)] md:h-20 md:w-20" />
        <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_14px_6px_rgb(255_246_223/0.7)]" />
      </div>
    </div>
  );
}
