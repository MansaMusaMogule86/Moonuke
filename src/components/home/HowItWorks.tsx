import { brand } from "@/config/brand";
import { SectionHeading } from "./SectionHeading";

const STEPS = [
  ["Get your invitation", `${brand.name} is invitation-only for now. Open the personal link you were sent, choose the name creators will see, and we approve your account.`],
  ["Follow and choose a membership", "Follow creators for free, then join a membership level when you want more. Each creator sets their own levels and prices."],
  ["Enjoy content and conversations", "See the posts your membership includes and message creators directly. Members can ask us to invite someone they know."],
] as const;

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="smoke-minimal section-y border-t border-line bg-ink-2">
      <div className="container-page">
        <SectionHeading
          id="how-title"
          eyebrow="How it works"
          title={<>Three steps to a <em className="text-metal">closer connection.</em></>}
        />
        <ol className="mt-12 grid gap-5 md:grid-cols-3">
          {STEPS.map(([title, body], i) => (
            <li
              key={title}
              className="mk-reveal relative overflow-hidden rounded-[var(--radius-xl)] border border-line bg-ink p-6 transition-colors hover:border-gold/35 md:p-8"
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-[38px] leading-none text-gold">{`0${i + 1}`}</span>
                <span aria-hidden className={i === 1 ? "h-1.5 w-1.5 rounded-full bg-pink" : "h-1.5 w-1.5 rounded-full bg-gold/60"} />
              </div>
              <h3 className="mt-6 text-[19px] font-medium text-ivory">{title}</h3>
              <p className="mt-2.5 text-[15px] leading-relaxed text-stone">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
