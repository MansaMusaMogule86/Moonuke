import { LuxuryTierCard } from "@/components/ui/luxury";
import { PinkAccent, SmokySection } from "./Atmosphere";
import { SectionHeading } from "./SectionHeading";

const LEVELS = [
  {
    name: "Follow",
    kind: "follow" as const,
    price: "Free",
    points: ["Preview posts from the creator", "Updates in your notifications", "Join a membership whenever you like"],
  },
  {
    name: "Member",
    kind: "member" as const,
    price: "Price set by the creator",
    points: ["Members-only posts", "Direct messages, when the creator allows them", "Your unlocked posts kept in your library"],
  },
  {
    name: "VIP",
    kind: "vip" as const,
    price: "Price set by the creator",
    points: ["Everything in Member", "VIP-only posts", "Priority access in the creator's VIP room"],
  },
] as const;

export function Memberships() {
  return (
    <SmokySection id="memberships" ariaLabelledBy="memberships-title" variant="memberships" curve="arc">
      <span id="tiers" className="block -translate-y-24" aria-hidden />
      <span id="vault" className="block -translate-y-24" aria-hidden />
      <span id="features" className="block -translate-y-24" aria-hidden />
      <div className="container-page relative">
        <SectionHeading
          id="memberships-title"
          eyebrow="Memberships & Features"
          title={<>Choose how <em className="text-neon">close</em> you want to be.</>}
          lede="Every creator offers the same simple levels, and each one decides their own prices. Some posts can also be unlocked one at a time."
        />
        <ul className="mt-10 grid gap-5 md:mt-12 md:grid-cols-3 md:gap-6">
          {LEVELS.map((l) => (
            <li key={l.name} className="mk-reveal flex">
              <LuxuryTierCard
                name={l.name}
                kind={l.kind}
                priceLabel={l.price}
                periodLabel=""
                benefits={l.points}
                className="w-full"
              />
            </li>
          ))}
        </ul>
        <div className="mk-reveal mt-6 flex items-start gap-3.5 rounded-[var(--radius-lg)] border border-gold/35 bg-[linear-gradient(145deg,rgb(24_18_27/0.88)_0%,rgb(12_9_14/0.94)_100%)] px-5 py-4 text-[14px] leading-relaxed text-stone shadow-[inset_0_1px_0_rgb(243_213_138/0.18)]">
          <PinkAccent variant="diamond" tone="gold" className="mt-1.5" />
          <p>
            <span className="font-medium text-gold-soft">Payments aren&apos;t open yet.</span> Paid memberships and single-post unlocks become available once payments are switched on. Until then nobody is charged, and following is free.
          </p>
        </div>
      </div>
    </SmokySection>
  );
}
