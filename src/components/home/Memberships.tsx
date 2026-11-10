import { Badge } from "@/components/ui/Badge";
import { SectionHeading } from "./SectionHeading";

const LEVELS = [
  { name: "Follow", tone: "neutral", price: "Free", points: ["Preview posts from the creator", "Updates in your notifications", "Join a membership whenever you like"] },
  { name: "Member", tone: "member", price: "Price set by the creator", points: ["Members-only posts", "Direct messages, when the creator allows them", "Your unlocked posts kept in your library"] },
  { name: "VIP", tone: "vip", price: "Price set by the creator", points: ["Everything in Member", "VIP-only posts"] },
] as const;

export function Memberships() {
  return (
    <section id="memberships" aria-labelledby="memberships-title" className="section-y border-t border-line">
      <span id="tiers" className="block -translate-y-24" aria-hidden />
      <span id="vault" className="block -translate-y-24" aria-hidden />
      <div className="container-page">
        <SectionHeading
          id="memberships-title"
          eyebrow="Memberships"
          title="Choose how close you want to be."
          lede="Every creator offers the same simple levels, and each one decides their own prices. Some posts can also be unlocked one at a time."
        />
        <ul className="mt-12 grid gap-4 md:grid-cols-3">
          {LEVELS.map((l) => (
            <li
              key={l.name}
              className={`mk-reveal flex flex-col rounded-[var(--radius-xl)] border p-6 md:p-7 ${l.name === "VIP" ? "border-line-gold bg-ink-2" : "border-line bg-ink-2"}`}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-[30px] leading-none text-ivory">{l.name}</h3>
                <Badge tone={l.tone}>{l.name === "Follow" ? "Free" : l.name}</Badge>
              </div>
              <p className="mt-3 text-[14px] text-ash">{l.price}</p>
              <ul className="mt-6 space-y-3 border-t border-line pt-6">
                {l.points.map((p) => (
                  <li key={p} className="flex gap-3 text-[15px] leading-snug text-stone">
                    <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                    {p}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <p className="mk-reveal mt-6 rounded-[var(--radius-md)] border border-line bg-ink-2 px-5 py-4 text-[14px] leading-relaxed text-stone">
          <span className="text-ivory">Payments aren&apos;t open yet.</span> Paid memberships and single-post unlocks become available once payments are switched on. Until then nobody is charged, and following is free.
        </p>
      </div>
    </section>
  );
}
