import { Symbol } from "@/components/brand/Symbol";
import { Button } from "@/components/ui/Button";

export function Closing() {
  return (
    <section aria-labelledby="closing-title" className="section-y border-t border-line">
      <div className="container-page">
        <div className="mk-reveal relative overflow-hidden rounded-[var(--radius-xl)] border border-line-strong bg-ink-2 px-6 py-14 text-center md:px-12 md:py-20">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_70%_at_50%_0%,rgb(255_45_150/0.10),transparent_70%)]" />
          <Symbol size={64} className="relative mx-auto" />
          <h2 id="closing-title" className="relative mx-auto mt-6 max-w-[36rem] font-display text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.08] text-ivory">
            Already invited? Your creators are waiting.
          </h2>
          <p className="relative mx-auto mt-4 max-w-[32rem] text-[16px] leading-relaxed text-stone">
            Sign in to see the creators you follow, or open your invitation link to create your account.
          </p>
          <div className="relative mt-8 flex justify-center">
            <Button href="/signin" size="lg" arrow>
              Sign in
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
