import { brand } from "@/config/brand";
import { GoldGlowCard, PinkAccent, SmokySection } from "./Atmosphere";
import { SectionHeading } from "./SectionHeading";

const POINTS = [
  ["Your chosen name", "Creators see the name you pick, not your legal name or email address."],
  ["Locked means locked", "Members-only media is sent only to people who have access, through links that expire after a short time."],
  ["Private conversations", "Messages are between you and the creator. Staff access is limited to logged safety reviews."],
  ["You're in control", "Block or report anyone, opt out of Blasts, and manage your sessions and two-step sign-in from your account."],
] as const;

export function Privacy() {
  return (
    <SmokySection id="privacy" ariaLabelledBy="privacy-title" variant="privacy" curve="right">
      <div className="container-page grid gap-10 lg:grid-cols-12 lg:items-start">
        <SectionHeading
          id="privacy-title"
          eyebrow="Privacy and control"
          title={<>Designed around <em className="text-metal">your privacy.</em></>}
          lede={`Plain-language promises about how ${brand.name} works today.`}
          className="lg:col-span-5"
        />
        <ul className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
          {POINTS.map(([title, body], i) => (
            <GoldGlowCard
              key={title}
              as="li"
              accent={i % 2 === 0 ? "pink" : "gold"}
              className="mk-reveal p-6"
            >
              <h3 className="flex items-center gap-3 font-display text-[21px] text-ivory">
                <PinkAccent variant="diamond" tone={i % 2 === 0 ? "pink" : "gold"} />
                <span>{title}</span>
              </h3>
              <p className="mt-3 text-[14.5px] leading-relaxed text-stone">{body}</p>
            </GoldGlowCard>
          ))}
        </ul>
      </div>
    </SmokySection>
  );
}
