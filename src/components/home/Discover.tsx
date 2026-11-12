import { Button } from "@/components/ui/Button";
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
    <section id="discover" aria-labelledby="discover-title" className="smoke-ambient section-y relative border-t border-line bg-ink">
      <span id="circle" className="block -translate-y-24" aria-hidden />
      <div className="container-page">
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <SectionHeading
            id="discover-title"
            eyebrow="Discover"
            title={<>Creators across <em className="text-metal">every passion.</em></>}
            lede="Creators publish what they love making, and you choose who to follow. Profiles and categories are open to members once they sign in."
          />
          <Button href="/discover" variant="outline" arrow className="self-start border-gold/45 md:self-auto">
            Sign in to browse
          </Button>
        </div>
        <ul className="mt-12 grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {KINDS.map(([name, line], i) => (
            <li
              key={name}
              className="mk-reveal smoke-minimal rounded-[var(--radius-lg)] border border-line bg-ink-2 p-5 transition-colors duration-[260ms] hover:border-gold/40"
            >
              <span
                aria-hidden
                className={
                  i % 3 === 1
                    ? "block h-1.5 w-7 rounded-full bg-pink shadow-[0_0_8px_rgb(245_42_139/0.45)]"
                    : "block h-1.5 w-7 rounded-full bg-gold"
                }
              />
              <p className="mt-4 font-display text-[21px] text-ivory">{name}</p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-stone">{line}</p>
            </li>
          ))}
          <li className="mk-reveal flex flex-col justify-center rounded-[var(--radius-lg)] border border-dashed border-gold/35 bg-ink-2/50 p-5">
            <p className="font-display text-[20px] italic text-gold-soft">And more</p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-stone">New creators join by invitation.</p>
          </li>
        </ul>
      </div>
    </section>
  );
}
