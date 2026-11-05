"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { Badge, LockGlyph } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Portrait } from "@/components/ui/Portrait";
import { Reveal } from "@/components/ui/Reveal";
import { Sheet } from "@/components/ui/Sheet";
import { showcase } from "@/lib/content/creators";
import { ease } from "@/lib/tokens";

type DemoPost = {
  id: string;
  kind: "open" | "vip" | "ppv";
  caption: string;
  price?: number;
  creator: (typeof showcase)[number];
};

const posts: DemoPost[] = [
  { id: "p1", kind: "open", caption: "Atelier, 6 a.m. The first fitting.", creator: showcase[0] },
  { id: "p2", kind: "vip", caption: "VIP room — the finished look, before anyone else.", creator: showcase[3] },
  { id: "p3", kind: "ppv", caption: "Contact sheet No. 14 — 36 frames.", price: 12, creator: showcase[4] },
];

/**
 * The Vault — demonstrates locked & pay-per-view presentation.
 * This is a presentation-only demo: no payment is taken and nothing is unlocked
 * client-side. Real entitlements are resolved on the server (Phase 5–6).
 */
export function Vault() {
  const [sheet, setSheet] = useState<DemoPost | null>(null);

  return (
    <section id="vault" aria-labelledby="vault-title" className="relative mx-auto max-w-[1600px] px-5 py-28 md:px-10 md:py-40">
      <div className="grid gap-16 md:grid-cols-12 md:gap-6">
        <Reveal className="md:col-span-4 md:sticky md:top-32 md:self-start">
          <p className="eyebrow mb-6">III — The Vault</p>
          <h2 id="vault-title" className="font-display text-[44px] leading-[1.02] tracking-[-0.02em] text-ivory md:text-[72px]">
            Locked means <em className="text-metal">locked.</em>
          </h2>
          <p className="mt-6 max-w-md text-[17px] leading-relaxed text-stone">
            Member posts, VIP rooms, and single unlocks — each one checked on our servers, never in your
            browser. Private media streams through short-lived signed links, not permanent public URLs.
          </p>
          <ul className="mt-10 space-y-4 text-[14px] text-ivory/85">
            {[
              ["Entitlements", "Verified server-side on every request"],
              ["Delivery", "Expiring, per-viewer signed links"],
              ["Your library", "Everything you unlock, kept in your private vault"],
            ].map(([k, v]) => (
              <li key={k} className="flex items-baseline gap-4 border-b border-line pb-4">
                <span className="eyebrow w-28 shrink-0 text-stone">{k}</span>
                <span>{v}</span>
              </li>
            ))}
          </ul>
        </Reveal>

        <div className="md:col-span-7 md:col-start-6">
          <ul className="grid gap-5 sm:grid-cols-2">
            {posts.map((p, i) => (
              <motion.li
                key={p.id}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "0px 0px -10% 0px" }}
                transition={{ duration: 1, ease: ease.out, delay: i * 0.08 }}
                className={i === 0 ? "sm:col-span-2" : ""}
              >
                <PostCard post={p} wide={i === 0} onUnlock={() => setSheet(p)} />
              </motion.li>
            ))}
          </ul>
        </div>
      </div>

      <Sheet
        open={!!sheet}
        onOpenChange={(o) => !o && setSheet(null)}
        title={sheet?.kind === "vip" ? "Join the VIP room" : "Unlock this post"}
        description={sheet ? `${sheet.creator.name} · ${sheet.creator.discipline}` : undefined}
      >
        {sheet && (
          <div className="pb-4">
            <div className="flex items-center gap-4 rounded-[var(--radius-lg)] border border-line bg-ink p-3">
              <div className="h-20 w-16 overflow-hidden rounded-md">
                <Portrait alt="" study={sheet.creator.study} className="h-full w-full blur-[6px]" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[15px] text-ivory">{sheet.caption}</p>
                <p className="mt-1 text-[13px] text-stone">
                  {sheet.kind === "vip" ? `VIP from $${sheet.creator.vipFrom} / month` : `One-time unlock · $${sheet.price}`}
                </p>
              </div>
            </div>
            <dl className="mt-6 space-y-3 text-[14px]">
              <div className="flex justify-between">
                <dt className="text-stone">Appears on statements as</dt>
                <dd className="text-ivory">A neutral descriptor</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone">Shown to the creator as</dt>
                <dd className="text-ivory">Your alias</dd>
              </div>
            </dl>
            <div role="note" className="mt-6 rounded-[var(--radius-md)] border border-gold/30 bg-gold/[0.06] p-4 text-[13px] leading-relaxed text-gold-soft">
              Preview only. Payments are not active in this build — no card is charged and nothing is
              unlocked. Final prices are always confirmed by the server at checkout.
            </div>
            <Button className="mt-6 w-full" size="lg" disabled>
              Checkout unavailable in preview
            </Button>
          </div>
        )}
      </Sheet>
    </section>
  );
}

function PostCard({ post, wide, onUnlock }: { post: DemoPost; wide: boolean; onUnlock: () => void }) {
  const locked = post.kind !== "open";
  return (
    <article className="group overflow-hidden rounded-[var(--radius-xl)] border border-line bg-ink-2">
      <div className={`relative overflow-hidden ${wide ? "aspect-[16/10]" : "aspect-[4/5]"}`}>
        <Portrait
          alt={locked ? "Locked preview" : `${post.creator.name} — ${post.caption}`}
          study={post.creator.study}
          className={`h-full w-full transition-[transform,filter] duration-[1400ms] ease-lux ${locked ? "scale-110 blur-[18px] brightness-75" : "group-hover:scale-[1.03]"}`}
        />
        {locked && (
          <div className="absolute inset-0 grid place-items-center p-6">
            <div className="flex flex-col items-center text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full border border-gold/50 bg-ink/50 text-gold-soft backdrop-blur-sm transition-transform duration-[520ms] ease-lux group-hover:scale-110">
                <LockGlyph className="h-5 w-5" />
              </span>
              <p className="mt-4 font-display text-[22px] italic text-ivory">
                {post.kind === "vip" ? "VIP room" : `$${post.price} to unlock`}
              </p>
              <Button size="sm" variant={post.kind === "vip" ? "gold" : "outline"} className="mt-5" onClick={onUnlock}>
                {post.kind === "vip" ? "Join VIP" : "Unlock"}
              </Button>
            </div>
          </div>
        )}
        <div className="absolute left-4 top-4">
          {post.kind === "vip" && <Badge tone="vip">VIP</Badge>}
          {post.kind === "ppv" && <Badge tone="locked">Pay-per-view</Badge>}
          {post.kind === "open" && <Badge tone="member">Members</Badge>}
        </div>
      </div>
      <div className="flex items-center gap-3 p-4">
        <div className="h-9 w-9 overflow-hidden rounded-full border border-line-strong">
          <Portrait alt="" study={post.creator.study} className="h-full w-full" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[14px] text-ivory">{post.creator.name}</p>
          <p className="truncate text-[13px] text-stone">{post.caption}</p>
        </div>
      </div>
    </article>
  );
}
