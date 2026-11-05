"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Portrait } from "@/components/ui/Portrait";
import type { ShowcaseCreator } from "@/lib/content/creators";
import { ease } from "@/lib/tokens";

/** "Tonight in the Circle" — two arched plates, stepped with arrows or swipe. */
export function HeroCarousel({ creators }: { creators: ShowcaseCreator[] }) {
  const [start, setStart] = useState(0);
  const [dir, setDir] = useState(1);
  const n = creators.length;
  const visible = [creators[start % n], creators[(start + 1) % n]];

  const step = (d: number) => {
    setDir(d);
    setStart((s) => (s + d + n) % n);
  };

  return (
    <div className="relative" aria-roledescription="carousel" aria-label="Tonight in the Circle">
      <div className="mb-4 flex items-baseline justify-between">
        <p className="eyebrow text-stone">Tonight in the Circle</p>
        <p className="text-[12px] tabular-nums text-ash" aria-live="polite">
          {String(start + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Arrow dir="prev" onClick={() => step(-1)} />
        <motion.div
          className="grid flex-1 touch-pan-y grid-cols-2 gap-3"
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.18}
          onDragEnd={(_, info) => {
            if (info.offset.x < -50) step(1);
            else if (info.offset.x > 50) step(-1);
          }}
        >
          <AnimatePresence mode="popLayout" initial={false} custom={dir}>
            {visible.map((c, i) => (
              <motion.a
                key={`${c.handle}-${start}`}
                href="#circle"
                custom={dir}
                initial={{ opacity: 0, x: dir * 40, filter: "blur(6px)" }}
                animate={{ opacity: 1, x: 0, filter: "blur(0px)", transition: { duration: 0.7, ease: ease.out, delay: i * 0.06 } }}
                exit={{ opacity: 0, x: dir * -40, filter: "blur(6px)", transition: { duration: 0.35, ease: ease.inOut } }}
                className="group block"
              >
                <div className="arch relative aspect-[3/4] overflow-hidden border border-line-strong p-[5px] transition-colors duration-[260ms] group-hover:border-gold/60">
                  <Portrait
                    alt=""
                    study={c.study}
                    className="arch h-full w-full transition-transform duration-[900ms] ease-lux group-hover:scale-[1.04]"
                  />
                </div>
                <p className="mt-3 truncate text-center font-display text-[17px] text-ivory">{c.name}</p>
                <p className="text-center text-[12px] text-stone">
                  VIP from <span className="text-gold">${c.vipFrom}</span>
                </p>
              </motion.a>
            ))}
          </AnimatePresence>
        </motion.div>
        <Arrow dir="next" onClick={() => step(1)} />
      </div>
    </div>
  );
}

function Arrow({ dir, onClick }: { dir: "prev" | "next"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === "prev" ? "Previous creators" : "Next creators"}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-stone transition-colors duration-[260ms] hover:bg-ivory/[0.06] hover:text-gold-soft"
    >
      <svg aria-hidden viewBox="0 0 20 20" className={`h-4 w-4 ${dir === "prev" ? "rotate-180" : ""}`}>
        <path d="M3 10h13M11 4.5 16.5 10 11 15.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    </button>
  );
}
