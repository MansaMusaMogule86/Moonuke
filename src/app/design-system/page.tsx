import { brand } from "@/config/brand";
import type { Metadata } from "next";
import { Logo } from "@/components/brand/Logo";
import { Symbol } from "@/components/brand/Symbol";
import { Wordmark } from "@/components/brand/Wordmark";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Badge } from "@/components/ui/Badge";
import { Portrait } from "@/components/ui/Portrait";
import { color, contrastRatio } from "@/lib/tokens";
import { InteractiveSpecimens, MotionSpecimens } from "./specimens";

export const metadata: Metadata = { title: "Design system", robots: { index: false } };

const swatches: { name: string; token: string; hex: string; role: string }[] = [
  { name: "Ink", token: "--mk-ink", hex: color.ink, role: "Page background. Most of every screen." },
  { name: "Ink 2", token: "--mk-ink-2", hex: color.ink2, role: "Raised surface: alternating sections, cards." },
  { name: "Ink 3", token: "--mk-ink-3", hex: color.ink3, role: "Elevated surface: inputs, menus, sheets." },
  { name: "Ink 4", token: "--mk-ink-4", hex: color.ink4, role: "Hover and pressed states on elevated surfaces." },
  { name: "Gold", token: "--mk-gold", hex: color.gold, role: "The brand: primary action, active place, VIP." },
  { name: "Soft gold", token: "--mk-gold-soft", hex: color.goldSoft, role: "Hover, focus rings, highlighted words." },
  { name: "Muted gold", token: "--mk-gold-muted", hex: color.goldMuted, role: "Quiet ornament only." },
  { name: "Pink", token: "--mk-pink", hex: color.pink, role: "Personality: a highlighted word, a sent message, a small accent." },
  { name: "Soft pink", token: "--mk-pink-soft", hex: color.pinkSoft, role: "Small pink text and hover on pink." },
  { name: "Ivory", token: "--mk-ivory", hex: color.ivory, role: "Primary text." },
  { name: "Stone", token: "--mk-stone", hex: color.stone, role: "Secondary text." },
  { name: "Ash", token: "--mk-ash", hex: color.ash, role: "Meta text, captions (AA minimum)." },
];

const typeScale = [
  { name: "Display", cls: "font-display text-[64px] leading-[1.02] tracking-[-0.02em]", spec: "Bodoni Moda · 44 → 80 · −2% · hero and section titles only" },
  { name: "Title", cls: "font-display text-[36px] leading-[1.06]", spec: "Bodoni Moda · 28–40" },
  { name: "Heading", cls: "text-[19px] font-medium", spec: "Jost 500 · 17–20 · cards, dashboards" },
  { name: "Body L", cls: "text-[17px] leading-relaxed", spec: "Jost 400 · 17 / 1.65" },
  { name: "Body", cls: "text-[15px] leading-relaxed", spec: "Jost 400 · 14–15 / 1.6" },
  { name: "Eyebrow", cls: "eyebrow", spec: "Jost 500 · 12 · +22% · caps" },
];

const covers = [
  { hair: "wrap", light: "left", adorn: "hoops", glow: 0.9 },
  { hair: "bun", light: "right", adorn: "crown", glow: 0.8 },
  { hair: "crop", light: "left", adorn: "collar", glow: 0.7 },
  { hair: "long", light: "right", adorn: "none", glow: 0.8 },
  { hair: "wrap", light: "right", adorn: "crown", tilt: 4, glow: 0.6 },
] as const;

export default function DesignSystemPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-[1400px] px-5 pb-32 pt-16 md:px-10">
        <header className="max-w-3xl">
          <p className="eyebrow mb-6">{brand.name} · Design system v0.1</p>
          <h1 className="font-display text-[56px] leading-[0.98] tracking-[-0.03em] text-ivory md:text-[104px]">
            Charcoal first. <em className="text-gold-soft">Gold</em> for the brand, <em className="text-pink">pink</em> for personality.
          </h1>
          <p className="mt-8 max-w-xl text-[17px] leading-relaxed text-stone">
            The rules that make every {brand.name} screen feel like one product. Tokens live in{" "}
            <code className="text-gold-soft">src/styles/tokens.css</code>; components in{" "}
            <code className="text-gold-soft">src/components/ui</code>.
          </p>
        </header>

        <Section n="01" title="Principles">
          <ol className="grid gap-px overflow-hidden rounded-[var(--radius-xl)] border border-line bg-line md:grid-cols-3">
            {[
              ["Charcoal carries the page", "Black and charcoal dominate. Warm white carries the words. Fill less; highlight what matters."],
              ["Gold and pink, sparingly", "Gold marks the primary action, the active place and VIP. Pink adds personality to one word or detail. Never every border."],
              ["Editorial outside, efficient inside", "Marketing pages use serif display and generous space. Dashboards, forms and messages favour clear sans-serif headings and density."],
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
              <Logo className="h-40" />
              <p className="max-w-sm text-center text-[13px] text-stone">
                <span className="text-ivory">Full logo.</span> The approved artwork, on pure black, with its empty margin trimmed. Use it
                at 88px tall or more: footers, sign-in screens, splash moments.
              </p>
            </div>
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-8 rounded-[var(--radius-xl)] border border-line bg-ink-2 p-10">
              <div className="flex items-end gap-6">
                <Symbol size={96} title={`${brand.name} monogram`} />
                <Symbol size={48} />
                <Symbol size={32} />
              </div>
              <Wordmark withSymbol className="text-[18px]" />
              <Wordmark tone="ivory" className="text-[14px]" />
              <p className="max-w-sm text-center text-[13px] text-stone">
                <span className="text-ivory">Monogram + wordmark.</span> The DF monogram is cropped from the logo; headers pair it with the
                Bodoni text wordmark so the name stays readable. Both art files sit on black and use <code className="text-gold-soft">logo-art</code>.
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
            <p className="eyebrow mb-4 text-stone">Metal — text wordmark only</p>
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
                  {t.name === "Eyebrow" ? "Creator memberships" : "A closer connection."}
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
            {covers.map((c, i) => (
              <figure key={i}>
                <Portrait alt="" study={c} className={`aspect-[3/4] ${i % 2 ? "arch" : "rounded-[var(--radius-xl)]"}`} />
                <figcaption className="mt-3 text-[12px] text-ash">{i % 2 ? "Arch plate" : "Editorial plate"}</figcaption>
              </figure>
            ))}
          </div>
          <p className="mt-6 max-w-2xl text-[14px] leading-relaxed text-stone">
            Creators without a photo get an abstract cover in the palette — never a figure or a made-up
            person. Arched plates for people, rounded rectangles for content.{" "}
            <code className="text-gold-soft">&lt;Portrait src&gt;</code> swaps in a real photo without layout changes.
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
