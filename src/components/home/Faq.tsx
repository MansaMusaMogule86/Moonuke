import { brand } from "@/config/brand";
import Link from "next/link";
import type { ReactNode } from "react";
import { SmokySection } from "./Atmosphere";
import { SectionHeading } from "./SectionHeading";

const link = "text-gold-soft underline decoration-gold/40 underline-offset-4 hover:decoration-gold";

const QA: [string, ReactNode][] = [
  ["How do I join?", `${brand.name} is invitation-only for now. When you're invited you get a personal link: open it, set up your account and choose the name creators will see. Each new account is approved by our team before it opens.`],
  ["Can a friend invite me?", "Members can ask us to invite someone they know from their account. We review every request, so an invitation isn't guaranteed."],
  ["What do memberships include?", "Following is free. Member and VIP levels are set up by each creator, who chooses the prices and what's included. Some posts can also be unlocked individually. Paid memberships open once payments are switched on."],
  ["How do creators join?", "Creators join by invitation too. Our team helps set up the profile, and identity and age checks are completed before a profile is published."],
  ["Who can see my details?", "Creators see the name you choose, not your legal name or email address. You can block or report anyone and opt out of Blasts at any time."],
  [`Who can use ${brand.name}?`, "Accounts are for people aged 18 and over. In some places the law requires an age check by an approved provider before certain content can be shown."],
  ["I can't sign in. What can I do?", <>Request a new password from the <Link href="/forgot" className={link}>password reset page</Link>. If you use two-step sign-in and lost your device, sign in with one of your recovery codes.</>],
  ["How do I report content?", <>Signed-in members can report any post, profile or message from the item itself. Anyone can report content shared without permission using the <Link href="/takedown" className={link}>report form</Link>.</>],
];

/** Native <details> disclosures: keyboard and screen-reader support without JavaScript. */
export function Faq() {
  return (
    <SmokySection id="faq" ariaLabelledBy="faq-title" variant="faq" curve="none">
      <div className="container-page grid gap-10 lg:grid-cols-12 lg:items-start">
        <SectionHeading
          id="faq-title"
          eyebrow="FAQ"
          title={<>Questions, <em className="text-gold-soft">answered.</em></>}
          lede="Clear answers on invitations, memberships, privacy and safety."
          className="lg:col-span-4"
        />
        <div className="divide-y divide-gold/18 overflow-hidden rounded-[var(--radius-xl)] border border-gold/30 bg-[linear-gradient(155deg,rgb(24_18_27/0.88)_0%,rgb(11_9_13/0.95)_62%,rgb(38_14_26/0.48)_100%)] px-5 py-2 shadow-[inset_0_1px_0_rgb(243_213_138/0.22),0_24px_60px_-24px_rgba(0,0,0,0.92)] md:px-8 lg:col-span-8">
          {QA.map(([q, a]) => (
            <details key={q} className="group">
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 py-4 text-[16.5px] font-medium text-ivory transition-colors hover:text-gold-soft [&::-webkit-details-marker]:hidden">
                <span>{q}</span>
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold/35 bg-ink/70 text-gold transition-all duration-[260ms] group-hover:border-gold group-open:rotate-45 group-open:border-pink/60 group-open:text-pink-soft"
                >
                  <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none">
                    <path d="M10 3v14M3 10h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </span>
              </summary>
              <div className="max-w-[40rem] pb-6 text-[15px] leading-relaxed text-stone">{a}</div>
            </details>
          ))}
        </div>
      </div>
    </SmokySection>
  );
}
