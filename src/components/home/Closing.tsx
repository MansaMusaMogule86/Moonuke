import { Symbol } from "@/components/brand/Symbol";
import { Button } from "@/components/ui/Button";
import { AtmosphericCTA, SmokySection } from "./Atmosphere";

export function Closing() {
  return (
    <SmokySection ariaLabelledBy="closing-title" variant="closing" curve="arc">
      <div className="container-page">
        <AtmosphericCTA>
          <Symbol size={68} className="relative mx-auto" />
          <p className="eyebrow relative mt-5 inline-flex items-center gap-2 text-gold">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-pink shadow-[0_0_8px_rgb(245_42_139/0.8)]" />
            <span>Private Invitations</span>
          </p>
          <h2
            id="closing-title"
            className="relative mx-auto mt-3 max-w-[36rem] font-display text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.08] text-ivory"
          >
            Already invited? Your <em className="text-metal">creators</em> are waiting.
          </h2>
          <p className="relative mx-auto mt-4 max-w-[32rem] text-[15.5px] leading-relaxed text-stone md:text-[16.5px]">
            Sign in to see the creators you follow, or open your invitation link to create your account.
          </p>
          <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button
              href="/signin"
              size="lg"
              arrow
              className="shadow-[inset_0_1px_0_rgb(255_255_255/0.55),0_10px_32px_-8px_rgb(216_173_82/0.55)]"
            >
              Sign in
            </Button>
            <Button
              href="/discover"
              size="lg"
              variant="outline"
              className="border-gold/55 bg-ink/60 backdrop-blur-sm hover:border-gold hover:bg-gold/[0.08]"
            >
              Discover Creators
            </Button>
          </div>
        </AtmosphericCTA>
      </div>
    </SmokySection>
  );
}
