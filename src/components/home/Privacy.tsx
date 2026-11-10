import { brand } from "@/config/brand";
import { SectionHeading } from "./SectionHeading";

const POINTS = [
  ["Your chosen name", "Creators see the name you pick, not your legal name or email address."],
  ["Locked means locked", "Members-only media is sent only to people who have access, through links that expire after a short time."],
  ["Private conversations", "Messages are between you and the creator. Staff access is limited to logged safety reviews."],
  ["You're in control", "Block or report anyone, opt out of Blasts, and manage your sessions and two-step sign-in from your account."],
] as const;

export function Privacy() {
  return (
    <section id="privacy" aria-labelledby="privacy-title" className="section-y border-t border-line">
      <div className="container-page grid gap-12 lg:grid-cols-12">
        <SectionHeading
          id="privacy-title"
          eyebrow="Privacy and control"
          title="Designed around your privacy."
          lede={`Plain-language promises about how ${brand.name} works today.`}
          className="lg:col-span-5"
        />
        <dl className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
          {POINTS.map(([title, body]) => (
            <div key={title} className="mk-reveal rounded-[var(--radius-lg)] border border-line bg-ink-2 p-6">
              <dt className="flex items-center gap-3 text-[17px] text-ivory">
                <span aria-hidden className="h-2 w-2 rotate-45 bg-pink" />
                {title}
              </dt>
              <dd className="mt-2.5 text-[15px] leading-relaxed text-stone">{body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
