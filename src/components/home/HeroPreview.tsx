import { brand } from "@/config/brand";
import { LockGlyph } from "@/components/ui/Badge";

/**
 * Illustrative product preview: a members-only post, a conversation and the
 * membership levels. No real people, prices, counts or badges are implied.
 */
export function HeroPreview() {
  return (
    <figure className="relative mx-auto w-full max-w-[520px]">
      <figcaption className="sr-only">
        Illustrative preview of {brand.name}: a members-only post, a conversation with a creator, and the membership levels.
      </figcaption>
      <div aria-hidden className="grid grid-cols-6 gap-4">
        {/* Post */}
        <div className="col-span-6 overflow-hidden rounded-[var(--radius-xl)] border border-line-strong bg-ink-2 shadow-[var(--mk-shadow-2)]">
          <div className="relative aspect-[16/11] bg-[radial-gradient(80%_60%_at_30%_20%,rgb(255_60_172/0.35),transparent_70%),radial-gradient(70%_60%_at_80%_80%,rgb(216_184_107/0.35),transparent_70%),linear-gradient(160deg,#1f1b29,#121217)]">
            <div className="absolute inset-0 bg-[repeating-linear-gradient(115deg,transparent_0_46px,rgb(246_242_235/0.035)_46px_48px)]" />
            <div className="absolute left-4 top-4 flex gap-2">
              <span className="rounded-full bg-ink/70 px-3 py-1 text-[12px] text-ivory backdrop-blur">Fashion</span>
            </div>
            <div className="absolute inset-x-4 bottom-4 rounded-[var(--radius-md)] border border-line-strong bg-ink/75 p-4 backdrop-blur">
              <div className="flex items-center gap-2 text-[12px] text-gold-soft">
                <LockGlyph className="h-3.5 w-3.5" /> Members
              </div>
              <p className="mt-1.5 text-[15px] leading-snug text-ivory">Studio diary: fitting the new collection</p>
            </div>
          </div>
        </div>

        {/* Conversation */}
        <div className="col-span-6 flex flex-col justify-center gap-3 rounded-[var(--radius-lg)] border border-line-strong bg-ink-3 p-4 shadow-[var(--mk-shadow-1)] sm:col-span-3">
          <p className="text-[12px] text-ash">Messages</p>
          <p className="w-[92%] rounded-2xl rounded-bl-md bg-ink-4 px-3 py-2 text-[13px] leading-snug text-ivory">
            The full fitting video is up for members.
          </p>
          <p className="ml-auto w-[80%] rounded-2xl rounded-br-md bg-pink px-3 py-2 text-[13px] leading-snug text-ink">
            Watching now. Love the blue one!
          </p>
        </div>

        {/* Levels */}
        <div className="col-span-6 rounded-[var(--radius-lg)] border border-line-strong bg-ink-3 p-4 shadow-[var(--mk-shadow-1)] sm:col-span-3">
          <p className="text-[12px] text-ash">Memberships</p>
          <ul className="mt-3 space-y-2 text-[13px]">
            <li className="flex items-baseline justify-between gap-2 text-ivory">Follow <span className="text-[12px] text-ash">Free</span></li>
            <li className="flex items-baseline justify-between gap-2 text-ivory">Member <span className="text-[12px] text-ash">Creator&apos;s price</span></li>
            <li className="flex items-baseline justify-between gap-2 text-gold-soft">VIP <span className="text-[12px] text-ash">Creator&apos;s price</span></li>
          </ul>
        </div>
      </div>
      <p className="mt-4 text-center text-[12px] text-ash sm:text-right">Illustrative preview</p>
    </figure>
  );
}
