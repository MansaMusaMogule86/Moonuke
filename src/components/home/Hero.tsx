import { Button } from "@/components/ui/Button";
import { HeroPreview } from "./HeroPreview";

/**
 * Editorial hero: copy and real actions on the left, an illustrative product
 * preview on the right. Server-rendered; entrance motion is CSS only.
 */
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(60%_60%_at_75%_0%,rgb(255_60_172/0.10),transparent_70%),radial-gradient(50%_60%_at_15%_10%,rgb(216_184_107/0.08),transparent_70%)]" />
      <div className="container-page grid items-center gap-14 pb-20 pt-12 md:pt-16 lg:grid-cols-12 lg:gap-10 lg:pb-28 lg:pt-20">
        <div className="lg:col-span-7">
          <p className="eyebrow mk-rise">Creator memberships, by invitation</p>
          <h1
            id="hero-title"
            className="mk-rise mt-5 font-display text-[clamp(2.6rem,5.4vw,4.4rem)] leading-[1.02] tracking-[-0.02em] text-ivory"
          >
            More than a follow.
            <span className="block">
              A <em className="text-pink">closer</em> connection.
            </span>
          </h1>
          <p className="mk-rise-2 mt-6 max-w-[34rem] text-[18px] leading-relaxed text-stone">
            Exclusive content, meaningful conversations, and memberships that bring you closer to the creators you love.
          </p>
          <div className="mk-rise-3 mt-9 flex flex-col gap-3 sm:flex-row">
            <Button href="/signin" size="lg" arrow>
              Sign in
            </Button>
            <Button href="#how-it-works" size="lg" variant="outline">
              How invitations work
            </Button>
          </div>
          <p className="mk-rise-3 mt-5 max-w-[30rem] text-[14px] leading-relaxed text-ash">
            New here? Joining is by personal invitation for now. Open the link you were sent to create your account.
          </p>
        </div>
        <div className="mk-rise-2 lg:col-span-5">
          <HeroPreview />
        </div>
      </div>
    </section>
  );
}
