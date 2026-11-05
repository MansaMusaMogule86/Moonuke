import { Symbol } from "@/components/brand/Symbol";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";

export function Closing() {
  return (
    <section aria-labelledby="closing-title" className="relative overflow-hidden py-32 md:py-48">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[90vw] w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-full border border-gold/[0.07] md:h-[60vw] md:w-[60vw]" />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[66vw] w-[66vw] -translate-x-1/2 -translate-y-1/2 rounded-full border border-gold/[0.1] md:h-[44vw] md:w-[44vw]" />
      <Reveal className="relative mx-auto max-w-4xl px-5 text-center">
        <Symbol size={56} className="mx-auto" />
        <h2 id="closing-title" className="mt-10 font-display text-[52px] italic leading-[0.98] tracking-[-0.03em] text-ivory md:text-[120px]">
          The door is <span className="text-metal">open</span> tonight.
        </h2>
        <p className="mx-auto mt-8 max-w-md text-[17px] text-stone">
          Entry is free. Verification takes a few minutes. Your alias is yours from the first night.
        </p>
        <div className="mt-12 flex flex-wrap justify-center gap-3">
          <Button href="#tiers" size="lg" arrow>
            Request entry
          </Button>
          <Button href="#creators" size="lg" variant="outline">
            I&apos;m a creator
          </Button>
        </div>
      </Reveal>
    </section>
  );
}
