import { GoldGlowCard, PinkAccent, SmokySection } from "./Atmosphere";
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
    <SmokySection id="creators" ariaLabelledBy="creators-title" variant="creators" curve="left">
      <div className="container-page grid gap-10 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-5">
          <SectionHeading
            id="creators-title"
            eyebrow="For creators"
            title={<>Your work, your audience, <em className="text-gold-soft">your terms.</em></>}
            lede="Creators join by invitation and are verified before their profile goes live. Earnings and payouts start when payments open."
          />
          <div className="mk-reveal relative mt-8 overflow-hidden rounded-[var(--radius-xl)] border border-gold/40 bg-[linear-gradient(145deg,rgb(34_22_35/0.86)_0%,rgb(12_10_14/0.94)_60%,rgb(52_16_31/0.55)_100%)] p-6 shadow-[inset_0_1px_0_rgb(243_213_138/0.28),0_24px_56px_-22px_rgba(0,0,0,0.9)]">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-[radial-gradient(closest-side,rgb(245_42_139/0.18),transparent)]"
            />
            <div className="flex items-center gap-2.5">
              <PinkAccent variant="diamond" tone="pink" />
              <span className="eyebrow text-[11px] text-gold">Invitation-Only Studio</span>
            </div>
            <p className="mt-3 font-display text-[22px] leading-snug text-ivory">
              Designed for creators who value discretion and ownership.
            </p>
            <p className="mt-2 text-[14px] leading-relaxed text-stone">
              Every creator receives personal onboarding, referral links for their community, and full control over their rooms and pricing.
            </p>
          </div>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
          {TOOLS.map(([title, body], i) => {
            const isPink = i % 2 === 1;
            return (
              <GoldGlowCard
                key={title}
                as="li"
                accent={isPink ? "pink" : "gold"}
                className="mk-reveal p-6"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[11px] tracking-[0.2em] text-gold-soft/80">
                    {`0${i + 1}`}
                  </span>
                  <PinkAccent variant="dot" tone={isPink ? "pink" : "gold"} />
                </div>
                <h3 className="mt-3.5 font-display text-[22px] text-ivory">{title}</h3>
                <p className="mt-2.5 text-[14.5px] leading-relaxed text-stone">{body}</p>
              </GoldGlowCard>
            );
          })}
        </ul>
      </div>
    </SmokySection>
  );
}
