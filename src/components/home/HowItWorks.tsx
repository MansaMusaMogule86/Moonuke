import { brand } from "@/config/brand";
import { SectionHeading } from "./SectionHeading";

const STEPS = [
  ["Get your invitation", `${brand.name} is invitation-only for now. Open the personal link you were sent, choose the name creators will see, and we approve your account.`],
  ["Follow and choose a membership", "Follow creators for free, then join a membership level when you want more. Each creator sets their own levels and prices."],
  ["Enjoy content and conversations", "See the posts your membership includes and message creators directly. Members can ask us to invite someone they know."],
] as const;

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="section-y border-t border-line bg-ink-2">
      <div className="container-page">
        <SectionHeading id="how-title" eyebrow="How it works" title="Three steps to a closer connection." />
        <ol className="mt-12 grid gap-4 md:grid-cols-3">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="mk-reveal rounded-[var(--radius-lg)] border border-line bg-ink p-6 md:p-7">
              <span className="font-display text-[34px] leading-none text-gold">{i + 1}</span>
              <h3 className="mt-5 text-[19px] font-medium text-ivory">{title}</h3>
              <p className="mt-2.5 text-[15px] leading-relaxed text-stone">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
