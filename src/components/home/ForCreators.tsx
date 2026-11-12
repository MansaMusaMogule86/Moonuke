import { SectionHeading } from "./SectionHeading";

const TOOLS = [
  ["Publishing", "Create posts and choose who sees each one: everyone, members, VIPs, or a single paid unlock."],
  ["Memberships", "Set up your Member and VIP levels with your own prices and benefits."],
  ["Messages and Blasts", "Reply to members one to one, or send a Blast to a group. Fans can opt out of Blasts at any time."],
  ["Audience insights", "See how your posts and memberships are doing. Insights never reveal who your fans are."],
  ["Guided onboarding", "Our team helps you set up: profile suggestions, importing your public links, and a review before you go live."],
  ["Safety tools", "Two-step sign-in, blocking and reporting, and a takedown process for content shared without permission."],
] as const;

export function ForCreators() {
  return (
    <section id="creators" aria-labelledby="creators-title" className="smoke-minimal section-y border-t border-line bg-ink-2">
      <div className="container-page">
        <SectionHeading
          id="creators-title"
          eyebrow="For creators"
          title={<>Your work, your audience, <em className="text-gold-soft">your terms.</em></>}
          lede="Creators join by invitation and are verified before their profile goes live. Earnings and payouts start when payments open."
        />
        <ul className="mt-12 grid gap-px overflow-hidden rounded-[var(--radius-xl)] border border-line-gold/35 bg-line sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map(([title, body], i) => (
            <li key={title} className="mk-reveal bg-ink-2 p-6 md:p-8">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[18px] font-medium text-ivory">{title}</h3>
                <span aria-hidden className={i % 2 === 1 ? "h-1.5 w-1.5 rounded-full bg-pink" : "h-1.5 w-1.5 rounded-full bg-gold"} />
              </div>
              <p className="mt-3 text-[15px] leading-relaxed text-stone">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
