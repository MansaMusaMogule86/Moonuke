import Image from "next/image";
import { Button } from "@/components/ui/Button";

const TRUST = [
  {
    label: "By invitation",
    icon: (
      <path d="M10 2.75a3.25 3.25 0 0 0-3.25 3.25V8.5H5.5A1.25 1.25 0 0 0 4.25 9.75v6A1.25 1.25 0 0 0 5.5 17h9a1.25 1.25 0 0 0 1.25-1.25v-6A1.25 1.25 0 0 0 14.5 8.5h-1.25V6A3.25 3.25 0 0 0 10 2.75Zm-1.75 3.25a1.75 1.75 0 1 1 3.5 0V8.5h-3.5V6Z" />
    ),
  },
  {
    label: "Private by design",
    icon: (
      <path d="M10 2.25 4 4.75v4.6c0 3.85 2.55 7.05 6 8.4 3.45-1.35 6-4.55 6-8.4v-4.6l-6-2.5Zm-.75 10.06-2.28-2.28 1.06-1.06 1.22 1.22 3.22-3.22 1.06 1.06-4.28 4.28Z" />
    ),
  },
  {
    label: "Creator first",
    icon: (
      <path d="M2.75 6.5 6.5 10l3.5-5.25L13.5 10l3.75-3.5-1.5 8.25H4.25L2.75 6.5Zm1.75 9.75h11v1.5h-11v-1.5Z" />
    ),
  },
];

/**
 * Approved DivaFans Smoky Luxury Hero.
 * Reconstructed as live, responsive, accessible HTML and CSS over the clean,
 * text-free extracted hero artwork (/assets/brand/divafans-hero-smoky.webp).
 * Preserves the obsidian/charcoal smoky atmosphere, champagne gold highlights,
 * neon pink lighting, diva line-art illustration, circular glow and pink waves.
 */
export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate overflow-hidden bg-ink lg:min-h-[min(100svh,937px)]"
    >
      {/* Level 1 Cinematic atmospheric underglow */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-20 smoke-cinematic" />

      {/* Approved smoky diva artwork: compact framed stage on mobile, unchanged full-bleed stage on desktop (1024px+) */}
      <div className="hero-mobile-stage relative mt-[56px] h-[24svh] min-h-[172px] max-h-[210px] w-full overflow-hidden sm:mt-[64px] sm:h-[28svh] sm:max-h-[250px] md:h-[32svh] md:max-h-[300px] lg:absolute lg:inset-0 lg:-z-10 lg:mt-0 lg:h-full lg:min-h-0 lg:max-h-none lg:overflow-visible">
        <div className="mk-parallax relative h-full w-full">
          <Image
            src="/assets/brand/divafans-hero-smoky.webp"
            alt=""
            fill
            preload
            fetchPriority="high"
            sizes="100vw"
            className="object-contain object-[74%_center] max-lg:scale-[1.24] max-lg:origin-[74%_42%] max-lg:mix-blend-lighten lg:scale-100 lg:object-cover lg:object-[66%_center] lg:[mask-image:linear-gradient(to_bottom,black_88%,transparent_100%)] xl:object-center"
          />
          {/* Subtle readability veil on the left for desktop */}
          <div
            aria-hidden
            className="pointer-events-none hidden lg:absolute lg:inset-0 lg:block lg:bg-[linear-gradient(90deg,#080709_0%,rgb(8_7_9/0.86)_34%,rgb(8_7_9/0.25)_54%,transparent_72%)]"
          />
        </div>
      </div>

      {/* Live editorial content column */}
      <div className="container-wide relative z-10 text-left lg:flex lg:min-h-[min(100svh,937px)] lg:items-center lg:pt-[84px]">
        <div className="-mt-3 pb-7 sm:-mt-4 sm:pb-9 md:pb-12 lg:mt-0 lg:max-w-[540px] lg:py-16 xl:max-w-[640px]">
          <p className="mk-rise flex items-center gap-2.5 text-[10.5px] font-medium uppercase tracking-[0.28em] text-gold sm:text-[11.5px] md:text-[13px] lg:gap-3.5 lg:tracking-[0.34em]">
            <span>Create</span>
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-pink shadow-[0_0_8px_var(--mk-pink)]" />
            <span>Share</span>
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-pink shadow-[0_0_8px_var(--mk-pink)]" />
            <span>Earn</span>
          </p>

          <h1
            id="hero-title"
            className="mk-rise-2 mt-2 font-display text-[clamp(2.02rem,9.4vw,2.625rem)] leading-[1.08] tracking-[-0.02em] text-ivory sm:mt-2.5 sm:text-[42px] md:mt-4 md:text-[48px] lg:mt-5 lg:text-[clamp(2.35rem,5.5vw,4.65rem)] lg:leading-[1.03]"
          >
            <span className="lg:block">A Premium </span>
            <span className="lg:block">Space for </span>
            <span className="max-lg:mt-0.5 max-lg:block max-lg:pb-1.5">
              <span className="relative inline-block">
                <em className="bg-[linear-gradient(95deg,#f52a8b_0%,#ff4da2_55%,#ff8bc8_100%)] bg-clip-text pr-[0.08em] font-normal italic text-transparent drop-shadow-[0_0_24px_rgb(245_42_139/0.28)]">
                  Exclusive
                </em>
                {/* Champagne gold brush swoosh underline from the approved reference */}
                <svg
                  aria-hidden
                  viewBox="0 0 260 22"
                  fill="none"
                  className="pointer-events-none max-lg:absolute max-lg:-bottom-1.5 max-lg:left-0 h-[9px] w-[90%] md:h-[12px] lg:static lg:mt-1 lg:block lg:h-[14px] lg:w-[88%]"
                >
                  <path
                    d="M4 17.5C62 5.5 154 3.5 256 14.5C184 9.5 88 11.5 18 19.5C10 20.3 4 19 4 17.5Z"
                    fill="url(#hero-gold-swoosh)"
                  />
                  <defs>
                    <linearGradient id="hero-gold-swoosh" x1="4" y1="12" x2="256" y2="12" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="#D8AD52" />
                      <stop offset="50%" stopColor="#F3D58A" />
                      <stop offset="100%" stopColor="#D8AD52" stopOpacity="0.25" />
                    </linearGradient>
                  </defs>
                </svg>
              </span>{" "}
              <span>Creators</span>
            </span>
          </h1>

          <p className="mk-rise-3 mt-3 max-w-[32rem] text-[14.5px] leading-[1.55] text-stone sm:text-[15px] md:mt-4 md:text-[16px] lg:mt-6 lg:max-w-[35rem] lg:text-[18px] lg:leading-[1.62]">
            Share exclusive content, grow your fanbase, and build a closer connection with your community on a platform designed for creators.
          </p>

          <div className="mk-rise-4 mt-4 flex flex-col gap-2.5 sm:mt-5 sm:flex-row sm:items-center sm:gap-3 md:mt-6 lg:mt-8">
            <Button
              href="/#creators"
              size="lg"
              arrow
              className="h-[46px] w-full px-6 text-[14.5px] font-medium shadow-[inset_0_1px_0_rgb(255_255_255/0.55),0_10px_32px_-8px_rgb(216_173_82/0.55)] hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.7),0_14px_40px_-8px_rgb(216_173_82/0.72)] sm:w-auto lg:h-14 lg:px-8 lg:text-[15px]"
            >
              Join as a Creator
            </Button>
            <Button
              href="/discover"
              size="lg"
              variant="outline"
              className="h-[46px] w-full border-gold/55 bg-ink/60 px-6 text-[14.5px] text-ivory backdrop-blur-sm hover:border-gold hover:bg-gold/[0.08] sm:w-auto lg:h-14 lg:px-8 lg:text-[15px]"
            >
              Discover Creators
            </Button>
          </div>

          <ul className="mk-rise-4 mt-4 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[12px] leading-tight text-ivory/90 sm:mt-5 sm:gap-x-4 sm:text-[13px] md:mt-6 lg:mt-8 lg:gap-x-5 lg:gap-y-2.5 lg:text-[14px]">
            {TRUST.map((t, i) => (
              <li key={t.label} className="flex items-center gap-1.5 lg:gap-2.5">
                {i > 0 && <span aria-hidden className="-ml-1.5 mr-1.5 h-3.5 w-px bg-pink/65 sm:-ml-2 sm:mr-2 lg:h-4" />}
                <svg aria-hidden viewBox="0 0 20 20" className="h-[14px] w-[14px] shrink-0 text-gold lg:h-[17px] lg:w-[17px]" fill="currentColor">
                  {t.icon}
                </svg>
                <span>{t.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
