import { Symbol } from "@/components/brand/Symbol";
import { Button } from "@/components/ui/Button";

export function Closing() {
  return (
    <section aria-labelledby="closing-title" className="section-y border-t border-line bg-ink">
      <div className="container-page">
        <div className="mk-reveal smoke-cinematic relative overflow-hidden rounded-[var(--radius-xl)] border border-gold/40 bg-ink-2 px-6 py-14 text-center shadow-[var(--mk-shadow-2)] md:px-12 md:py-20">
          <Symbol size={68} className="relative mx-auto" />
          <h2
            id="closing-title"
            className="relative mx-auto mt-6 max-w-[36rem] font-display text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.08] text-ivory"
          >
            Already invited? Your <em className="text-metal">creators</em> are waiting.
          </h2>
          <p className="relative mx-auto mt-4 max-w-[32rem] text-[16px] leading-relaxed text-stone">
            Sign in to see the creators you follow, or open your invitation link to create your account.
          </p>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <Button href="/signin" size="lg" arrow>
              Sign in
            </Button>
            <Button href="/discover" size="lg" variant="outline" className="border-gold/50">
              Discover Creators
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
