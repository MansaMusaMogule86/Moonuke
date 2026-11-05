import { Badge, LockGlyph } from "@/components/ui/Badge";
import type { PostView } from "@/server/services/club";
import { CheckoutButton } from "./CheckoutButton";

const accessLabel = { preview: "Free preview", members: "Members", vip: "VIP", ppv: "Pay-per-view" } as const;
const kindLabel = (p: PostView) => (p.mediaKind === "set" ? `${p.mediaCount} photos` : p.mediaKind === "video" ? "Video" : "Photo");
const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/**
 * Locked posts render from the teaser only — the server never sent their body
 * or media. The veil is a generic gradient, not a blurred copy of the asset.
 */
export function PostTile({ post, vipTierId, memberTierId }: { post: PostView; vipTierId?: string; memberTierId?: string }) {
  const locked = !post.unlocked;
  return (
    <article className="group overflow-hidden rounded-[var(--radius-xl)] border border-line bg-ink-2" aria-label={`${accessLabel[post.access]} post: ${post.teaser}`}>
      <div className="relative aspect-[4/5] overflow-hidden">
        {locked ? (
          <div className="grain absolute inset-0 bg-[radial-gradient(120%_90%_at_30%_20%,#2a2217_0%,#120f0b_45%,#070707_100%)]" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived, per-viewer URL; must not be cached by the image optimiser
          <img src={post.media?.[0]} alt={post.teaser} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1400ms] ease-lux group-hover:scale-[1.03]" />
        )}
        <div className="absolute left-4 top-4 flex gap-2">
          <Badge tone={post.access === "vip" ? "vip" : post.access === "ppv" ? "locked" : "member"}>{accessLabel[post.access]}</Badge>
        </div>
        {locked && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <div className="flex flex-col items-center">
              <span className="grid h-14 w-14 place-items-center rounded-full border border-gold/50 bg-ink/50 text-gold-soft">
                <LockGlyph className="h-5 w-5" />
              </span>
              <p className="mt-4 font-display text-[22px] italic text-ivory">
                {post.access === "ppv" ? `${post.priceLabel} to unlock` : post.access === "vip" ? "For the VIP room" : "For members"}
              </p>
              <p className="mt-1 text-[12px] text-stone">{kindLabel(post)}</p>
              <div className="mt-5">
                {post.access === "ppv" ? (
                  <CheckoutButton target={{ kind: "post", id: post.id }} size="sm" variant="outline">Unlock</CheckoutButton>
                ) : post.access === "vip" && vipTierId ? (
                  <CheckoutButton target={{ kind: "tier", id: vipTierId }} size="sm">Join VIP</CheckoutButton>
                ) : memberTierId ? (
                  <CheckoutButton target={{ kind: "tier", id: memberTierId }} size="sm" variant="outline">Become a member</CheckoutButton>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="p-4">
        <p className="text-[14px] text-ivory">{post.teaser}</p>
        {!locked && post.body && <p className="mt-2 text-[13px] leading-relaxed text-stone">{post.body}</p>}
        <p className="mt-2 text-[12px] text-ash">{date(post.publishedAt)} · {kindLabel(post)}</p>
      </div>
    </article>
  );
}
