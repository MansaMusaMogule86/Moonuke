import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { SmokySection, GoldGlowCard, PinkAccent } from "./Atmosphere";
import { SectionHeading } from "./SectionHeading";

const KINDS = [
  ["Fashion", "Fittings, looks and the making of a collection."],
  ["Fitness", "Training plans, form checks and routines."],
  ["Music", "Demos, rehearsals and first listens."],
  ["Beauty", "Techniques, routines and product notes."],
  ["Gaming", "Sessions, builds and behind-the-scenes."],
  ["Lifestyle", "Travel, food and everyday moments."],
  ["Art", "Studio work, sketches and process."],
] as const;

/** Discovery preview. Profiles are visible only after sign-in, so this shows kinds of creators, not people. */
export function Discover() {
  return (
    <SmokySection id="discover" ariaLabelledBy="discover-title" variant="discover" curve="right">
      <span id="circle" className="block -translate-y-24" aria-hidden />
      <div className="container-page">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <SectionHeading
            id="discover-title"
            eyebrow="Discover"
            title={<>Creators across <em className="text-metal">every passion.</em></>}
            lede="Creators publish what they love making, and you choose who to follow. Profiles and categories are open to members once they sign in."
          />
          <Button
            href="/discover"
            variant="outline"
            arrow
            className="self-start border-gold/45 bg-ink-2/60 hover:border-gold hover:bg-gold/10 md:self-auto"
          >
            Sign in to browse
          </Button>
        </div>

        <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 md:mt-12 md:grid-cols-3 lg:grid-cols-4">
          {KINDS.map(([name, line], i) => {
            const isPinkAccent = i % 3 === 1;
            const indexLabel = `0${i + 1}`;
            return (
              <GoldGlowCard
                key={name}
                as="li"
                accent={isPinkAccent ? "pink" : "gold"}
                className="mk-reveal p-5 md:p-6"
              >
                <div className="flex items-center justify-between gap-3">
                  <PinkAccent variant="bar" tone={isPinkAccent ? "pink" : "gold"} />
                  <span className="font-mono text-[10px] tracking-[0.22em] text-gold-soft/75">
                    {indexLabel}
                  </span>
                </div>
                <p className="mt-4 font-display text-[22px] tracking-[-0.01em] text-ivory transition-colors duration-200 group-hover:text-gold-soft">
                  {name}
                </p>
                <p className="mt-2 text-[14px] leading-relaxed text-stone">{line}</p>
              </GoldGlowCard>
            );
          })}

          <li className="mk-reveal group relative flex flex-col justify-between overflow-hidden rounded-[var(--radius-xl)] border border-dashed border-gold/40 bg-[linear-gradient(155deg,rgb(21_17_22/0.86),rgb(52_16_31/0.28))] p-5 transition-colors duration-300 hover:border-gold/65 md:p-6">
            <span
              aria-hidden
              className="pointer-events-none absolute -right-10 -bottom-10 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgb(245_42_139/0.16),transparent_70%)]"
            />
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 rounded-full border border-pink/40 bg-pink/10 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.22em] text-pink-soft">
                <PinkAccent variant="dot" tone="pink" />
                Curated
              </span>
              <span aria-hidden className="text-[12px] text-gold/70">✦</span>
            </div>
            <div className="mt-4">
              <p className="font-display text-[21px] italic text-gold-soft">And more</p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-stone">
                New creators join by invitation.{" "}
                <Link
                  href="/discover"
                  className="text-ivory/90 underline decoration-gold/45 underline-offset-4 transition-colors hover:text-gold-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink/55"
                >
                  Explore directory
                </Link>
              </p>
            </div>
          </li>
        </ul>
      </div>
    </SmokySection>
  );
}
