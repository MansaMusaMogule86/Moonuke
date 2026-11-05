import { brand } from "@/config/brand";
import type { Metadata } from "next";
import { Symbol } from "@/components/brand/Symbol";
import { Wordmark } from "@/components/brand/Wordmark";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Badge } from "@/components/ui/Badge";
import { Portrait } from "@/components/ui/Portrait";
import { showcase } from "@/lib/content/creators";
import { color, contrastRatio } from "@/lib/tokens";
import { InteractiveSpecimens, MotionSpecimens } from "./specimens";

export const metadata: Metadata = { title: "Design system", robots: { index: false } };

const swatches: { name: string; token: string; hex: string; role: string }[] = [
  { name: "Ink", token: "--mk-ink", hex: color.ink, role: "Background. The canvas — 80% of every screen." },
  { name: "Ink 2", token: "--mk-ink-2", hex: color.ink2, role: "Secondary background, alternating sections." },
  { name: "Ink 3", token: "--mk-ink-3", hex: color.ink3, role: "Elevated surfaces: sheets, focused cards." },
  { name: "Gold", token: "--mk-gold", hex: color.gold, role: "Primary CTA, active nav, premium indicators." },
  { name: "Soft gold", token: "--mk-gold-soft", hex: color.goldSoft, role: "Hover, focus rings, highlights." },
  { name: "Muted gold", token: "--mk-gold-muted", hex: color.goldMuted, role: "Hairlines and quiet ornament only." },
  { name: "Ivory", token: "--mk-ivory", hex: color.ivory, role: "Primary text." },
  { name: "Stone", token: "--mk-stone", hex: color.stone, role: "Secondary text." },
  { name: "Ash", token: "--mk-ash", hex: color.ash, role: "Meta text, captions (AA minimum)." },
];

const typeScale = [
  { name: "Display XL", cls: "font-display italic text-[96px] leading-[0.9] tracking-[-0.035em]", spec: "Bodoni Moda Italic · 96–300 · −3.5%" },
  { name: "Display L", cls: "font-display text-[72px] leading-[1.02] tracking-[-0.02em]", spec: "Bodoni Moda · 44 → 88 · −2%" },
  { name: "Title", cls: "font-display text-[36px] leading-none", spec: "Bodoni Moda · 28–40" },
  { name: "Body L", cls: "text-[17px] leading-relaxed", spec: "Jost 400 · 17 / 1.65" },
  { name: "Body", cls: "text-[14px] leading-relaxed", spec: "Jost 400 · 14 / 1.6" },
  { name: "Eyebrow", cls: "eyebrow", spec: "Jost 500 · 11 · +32% · caps" },
];

export default function DesignSystemPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-[1400px] px-5 pb-32 pt-36 md:px-10">
        <header className="max-w-3xl">
          <p className="eyebrow mb-6">{brand.name} · Design system v0.1</p>
          <h1 className="font-display text-[56px] leading-[0.98] tracking-[-0.03em] text-ivory md:text-[104px]">
            Black is the canvas. <em className="text-metal">Gold is a privilege.</em>
          </h1>
          <p className="mt-8 max-w-xl text-[17px] leading-relaxed text-stone">
            The rules that make every {brand.name} screen feel like the same private room. Tokens live in{" "}
            <code className="text-gold-soft">src/styles/tokens.css</code>; components in{" "}
            <code className="text-gold-soft">src/components/ui</code>.
          </p>
        </header>

        <Section n="01" title="Principles">
          <ol className="grid gap-px overflow-hidden rounded-[var(--radius-xl)] border border-line bg-line md:grid-cols-3">
            {[
              ["Darkness first", "Deep black negative space carries the luxury. Fill less; light what matters."],
              ["Gold is earned", "Gold marks one primary action per view, premium status, and the active place — never decoration for its own sake."],
              ["Editorial, not dashboard", "Asymmetry, oversized serif display, and real photography. No grids of identical cards."],
              ["One hand", "Every action reachable by thumb. 44px minimum targets. Sheets over modals on phones."],
              ["Motion with meaning", "Arrivals ease out, state changes ease in-out, drags use springs. All of it yields to reduced-motion."],
              ["Honest privacy", "Promise what we can enforce: server-side entitlements, signed links. Never “screenshot-proof”."],
            ].map(([t, d]) => (
              <li key={t} className="bg-ink p-7 md:p-9">
                <p className="font-display text-[24px] text-ivory">{t}</p>
                <p className="mt-3 text-[14px] leading-relaxed text-stone">{d}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section n="02" title="Brand marks">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-8 rounded-[var(--radius-xl)] border border-line bg-ink-2 p-10">
              <Symbol size={120} title={`${brand.name} symbol — the Diamond Ring`} />
              <div className="flex items-end gap-6">
                <Symbol size={48} />
                <Symbol size={32} />
                <Symbol size={20} />
              </div>
              <p className="max-w-sm text-center text-[13px] text-stone">
                <span className="text-ivory">The Diamond Ring.</span> A total eclipse at second contact — a dark
                moon, a corona, and one point of light. Minimum size 16px.
              </p>
            </div>
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-8 rounded-[var(--radius-xl)] border border-line bg-ink-2 p-10">
              <Wordmark className="text-[40px]" />
              <Wordmark withSymbol className="text-[20px]" />
              <Wordmark tone="ivory" className="text-[14px]" />
              <p className="max-w-sm text-center text-[13px] text-stone">
                Bodoni capitals at +30% tracking. The second O is a new moon — a hairline circle. Use the
                ivory tone below 14px, where the metal gradient loses fidelity.
              </p>
            </div>
          </div>
        </Section>

        <Section n="03" title="Colour">
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {swatches.map((s) => {
              const onInk = contrastRatio(s.hex, color.ink);
              return (
                <li key={s.token} className="overflow-hidden rounded-[var(--radius-lg)] border border-line">
                  <div className="h-28 md:h-36" style={{ background: s.hex }} />
                  <div className="space-y-1 bg-ink-2 p-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-display text-[19px] text-ivory">{s.name}</p>
                      <p className="font-mono text-[12px] uppercase text-stone">{s.hex}</p>
                    </div>
                    <p className="font-mono text-[11px] text-ash">{s.token}</p>
                    <p className="pt-1 text-[13px] leading-snug text-stone">{s.role}</p>
                    <p className="pt-1 text-[11px] tabular-nums text-ash">{onInk.toFixed(1)}:1 on Ink</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-6 rounded-[var(--radius-lg)] border border-line p-6">
            <p className="eyebrow mb-4 text-stone">Metal — wordmark &amp; hairlines only</p>
            <div className="h-16 rounded-md" style={{ background: "var(--mk-metal)" }} />
            <div className="hairline mt-6" />
          </div>
        </Section>

        <Section n="04" title="Typography">
          <ul className="divide-y divide-line border-y border-line">
            {typeScale.map((t) => (
              <li key={t.name} className="grid gap-4 py-8 md:grid-cols-12 md:items-baseline">
                <div className="md:col-span-3">
                  <p className="text-[14px] text-ivory">{t.name}</p>
                  <p className="mt-1 text-[12px] text-ash">{t.spec}</p>
                </div>
                <p className={`${t.cls} min-w-0 truncate text-ivory md:col-span-9`}>
                  {t.name === "Eyebrow" ? "A private creator club" : "The door is open tonight."}
                </p>
              </li>
            ))}
          </ul>
        </Section>

        <Section n="05" title="Motion">
          <MotionSpecimens />
        </Section>

        <Section n="06" title="Components">
          <InteractiveSpecimens />
        </Section>

        <Section n="07" title="Imagery">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            {showcase.map((c, i) => (
              <figure key={c.handle}>
                <Portrait alt={`Portrait study for ${c.name}`} study={c.study} className={`aspect-[3/4] ${i % 2 ? "arch" : "rounded-[var(--radius-xl)]"}`} />
                <figcaption className="mt-3 text-[12px] text-ash">{i % 2 ? "Arch plate" : "Editorial plate"}</figcaption>
              </figure>
            ))}
          </div>
          <p className="mt-6 max-w-2xl text-[14px] leading-relaxed text-stone">
            Photography direction: single key light, deep shadow, warm skin, one gold accent. Arched plates
            for people, rounded rectangles for content. The lit studies above are stand-ins until
            commissioned editorial photography lands; <code className="text-gold-soft">&lt;Portrait src&gt;</code>{" "}
            swaps them in without layout changes.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Badge tone="vip">VIP</Badge>
            <Badge tone="member">Members</Badge>
            <Badge tone="locked">Pay-per-view</Badge>
            <Badge tone="live">Live</Badge>
            <Badge>Draft</Badge>
          </div>
        </Section>
      </main>
      <SiteFooter />
    </>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`ds-${n}`} className="mt-28 md:mt-36">
      <div className="mb-10 flex items-baseline gap-5 border-b border-line pb-5">
        <span className="font-display text-[15px] italic text-gold">{n}</span>
        <h2 id={`ds-${n}`} className="font-display text-[34px] text-ivory md:text-[44px]">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}
