import Image from "next/image";
import { Button } from "@/components/ui/Button";

const TRUST = [
  { label: "By invitation", icon: <path d="M10 3.5a3 3 0 0 0-3 3V9H5.5v7.5h9V9H13V6.5a3 3 0 0 0-3-3Zm-1.5 3a1.5 1.5 0 0 1 3 0V9h-3V6.5Z" /> },
  { label: "Private by design", icon: <path d="M10 2.5 4 5v4.6c0 3.7 2.6 6.7 6 7.9 3.4-1.2 6-4.2 6-7.9V5l-6-2.5Zm0 1.6 4.5 1.9v3.6c0 2.9-1.9 5.3-4.5 6.4-2.6-1.1-4.5-3.5-4.5-6.4V6l4.5-1.9Z" /> },
  { label: "Creator first", icon: <path d="m10 3 1.9 4.6L17 8l-3.6 3.4 1 5L10 14l-4.4 2.4 1-5L3 8l5.1-.4L10 3Z" /> },
];

/**
 * Cinematic hero. The portrait is real artwork (a text-free crop of the approved
 * reference, public/images/hero); everything else is live UI. Motion is CSS:
 * staggered entrances, slow light drift and a desktop-only scroll parallax, all
 * off under prefers-reduced-motion.
 */
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden bg-ink lg:min-h-[min(100svh,920px)]">
      {/* Ambient light */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="mk-drift absolute -left-[10%] top-[10%] h-[60vw] max-h-[720px] w-[60vw] max-w-[720px] rounded-full bg-[radial-gradient(closest-side,rgb(212_175_55/0.14),transparent)]" />
        <div className="mk-glow absolute right-[8%] top-[30%] h-[40vw] max-h-[520px] w-[40vw] max-w-[520px] rounded-full bg-[radial-gradient(closest-side,rgb(255_45_150/0.12),transparent)]" />
      </div>

      {/* Portrait: on top below lg, right-hand side from lg */}
      <div className="relative mt-[72px] h-[42svh] min-h-[280px] max-h-[480px] md:h-[52svh] md:max-h-[580px] lg:absolute lg:inset-y-0 lg:right-0 lg:mt-0 lg:h-auto lg:max-h-none lg:w-[50%] xl:w-[min(58%,1000px)]">
        <div className="mk-parallax absolute inset-0">
          <Image
            src="/images/hero/divafans-hero-portrait.webp"
            alt=""
            fill
            preload
            fetchPriority="high"
            sizes="(min-width: 1280px) min(58vw, 1000px), (min-width: 1024px) 50vw, 100vw"
            className="object-cover object-[50%_18%] [mask-image:linear-gradient(to_bottom,transparent_0,black_28px,black_62%,transparent)] lg:[mask-image:linear-gradient(to_right,transparent_0%,black_32%),linear-gradient(to_bottom,black_75%,transparent)] lg:[mask-composite:intersect]"
          />
        </div>
      </div>

      <div className="container-wide relative lg:flex lg:min-h-[min(100svh,920px)] lg:items-center lg:pt-[84px]">
        <div className="-mt-10 pb-16 md:-mt-16 lg:mt-0 lg:max-w-[470px] lg:pb-0 xl:max-w-[620px]">
          <p className="mk-rise flex items-center gap-3 text-[12px] font-medium uppercase tracking-[0.32em] text-gold md:text-[13px]">
            Create <span aria-hidden className="h-1 w-1 rounded-full bg-pink" /> Share <span aria-hidden className="h-1 w-1 rounded-full bg-pink" /> Earn
          </p>
          <h1
            id="hero-title"
            className="mk-rise-2 mt-5 font-display text-[clamp(2.6rem,5.6vw,4.6rem)] leading-[1.02] tracking-[-0.02em] text-ivory"
          >
            A Premium Space for{" "}
            <em className="bg-[linear-gradient(100deg,var(--mk-pink)_0%,var(--mk-pink-soft)_45%,var(--mk-gold-soft)_100%)] bg-clip-text pr-[0.06em] text-transparent">
              Exclusive
            </em>{" "}
            Creators
          </h1>
          <p className="mk-rise-3 mt-6 max-w-[34rem] text-[17px] leading-relaxed text-stone md:text-[18px]">
            Share exclusive content, grow your fanbase, and build a closer connection with your community on a platform designed for creators.
          </p>
          <div className="mk-rise-4 mt-9 flex flex-col gap-3 sm:flex-row">
            <Button
              href="/#creators"
              size="lg"
              arrow
              className="shadow-[inset_0_1px_0_rgb(255_255_255/0.5),0_10px_34px_-10px_rgb(255_45_150/0.45)] hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.6),0_14px_40px_-10px_rgb(255_45_150/0.6)]"
            >
              Join as a Creator
            </Button>
            <Button href="/discover" size="lg" variant="outline" className="border-gold/50 bg-ink/40 backdrop-blur-sm">
              Discover Creators
            </Button>
          </div>
          <ul className="mk-rise-4 mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 text-[14px] text-ivory/85">
            {TRUST.map((t, i) => (
              <li key={t.label} className="flex items-center gap-2.5">
                {i > 0 && <span aria-hidden className="-ml-3 mr-3 hidden h-4 w-px bg-pink/50 sm:block" />}
                <svg aria-hidden viewBox="0 0 20 20" className="h-[18px] w-[18px] text-gold" fill="currentColor">
                  {t.icon}
                </svg>
                {t.label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
