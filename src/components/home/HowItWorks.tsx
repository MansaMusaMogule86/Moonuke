import { brand } from "@/config/brand";
import { GoldGlowCard, PinkAccent, SmokySection } from "./Atmosphere";
import { SectionHeading } from "./SectionHeading";

const STEPS = [
  ["Get your invitation", `${brand.name} is invitation-only for now. Open the personal link you were sent, choose the name creators will see, and we approve your account.`],
  ["Follow and choose a membership", "Follow creators for free, then join a membership level when you want more. Each creator sets their own levels and prices."],
  ["Enjoy content and conversations", "See the posts your membership includes and message creators directly. Members can ask us to invite someone they know."],
] as const;

export function HowItWorks() {
  return (
    <SmokySection id="how-it-works" ariaLabelledBy="how-title" variant="steps" curve="right">
      <div className="container-page relative">
        <SectionHeading
          id="how-title"
          eyebrow="How it works"
          title={<>Three steps to a <em className="text-metal">closer connection.</em></>}
        />
        <ol className="relative mt-10 grid gap-5 md:mt-12 md:grid-cols-3 md:gap-6">
          {STEPS.map(([title, body], i) => (
            <GoldGlowCard
              key={title}
              as="li"
              accent={i === 1 ? "pink" : "gold"}
              className="mk-reveal p-6 md:p-8"
            >
              <div className="flex items-center justify-between">
                <div className="inline-flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full border border-gold/45 bg-[radial-gradient(circle_at_30%_30%,rgb(216_173_82/0.20),rgb(8_7_9/0.9)_75%)] font-display text-[24px] leading-none text-gold-soft shadow-[0_0_20px_-6px_rgba(216,173,82,0.45)]">
                    {`0${i + 1}`}
                  </span>
                  <span className="eyebrow text-[10.5px] text-gold/85">{`Step 0${i + 1}`}</span>
                </div>
                <PinkAccent variant="dot" tone={i === 1 ? "pink" : "gold"} />
              </div>
              <div aria-hidden="true" className="hairline my-5" />
              <h3 className="font-display text-[23px] leading-snug text-ivory">{title}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-stone">{body}</p>
            </GoldGlowCard>
          ))}
        </ol>
      </div>
    </SmokySection>
  );
}
