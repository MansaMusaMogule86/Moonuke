import type { Metadata } from "next";
import { Badge } from "@/components/ui/Badge";
import { requireViewer } from "@/server/auth/request";
import { heldMessages, messagingRestrictions } from "@/server/services/messaging";
import { HeldReview, LiftButton } from "./MessagingForms";
import { DecideAppeal } from "./AppealForms";
import { openAppeals } from "@/server/services/blasts";

export const metadata: Metadata = { title: "Messaging · House" };

const when = (d: Date) => new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

export default async function AdminMessagingPage() {
  const owner = await requireViewer("moderation.review");
  const [held, restrictions, appeals] = [await heldMessages(owner), await messagingRestrictions(owner), await openAppeals(owner)];
  return (
    <div>
      <h1 className="font-display text-[40px] leading-none text-ivory md:text-[56px]">Messaging</h1>
      <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-stone">
        You can&apos;t browse private conversations. You see only messages held by the automatic rules, and reported messages with a little context (from Moderation). Every view is recorded in the audit log.
      </p>

      <section aria-labelledby="held-h" className="mt-10">
        <h2 id="held-h" className="font-display text-[28px] text-ivory">Held for review</h2>
        {held.length === 0 ? <p className="mt-4 text-[14px] text-ash">Nothing held.</p> : (
          <ul className="mt-4 space-y-3">
            {held.map((m) => (
              <li key={m.id} className="rounded-[var(--radius-lg)] border border-line bg-ink-2 p-5">
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-stone">
                  <span className="text-ivory">{m.sender_alias}</span> · {when(m.created_at)}
                  {m.risk_rules.map((r) => <Badge key={r} tone="locked">{r}</Badge>)}
                  <span className="text-ash">score {m.risk_score}</span>
                </div>
                <p className="mt-3 whitespace-pre-wrap break-words text-[15px] text-ivory">{m.body}</p>
                <div className="mt-4"><HeldReview id={m.id} /></div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="appeals-h" className="mt-12">
        <h2 id="appeals-h" className="font-display text-[28px] text-ivory">Appeals</h2>
        {appeals.length === 0 ? <p className="mt-4 text-[14px] text-ash">No open appeals.</p> : (
          <ul className="mt-4 space-y-3">
            {appeals.map((a) => (
              <li key={a.id} className="rounded-[var(--radius-lg)] border border-line bg-ink-2 p-5">
                <p className="text-[13px] text-stone"><span className="text-ivory">{a.alias}</span> · paused until {when(a.until)} · {a.automatic ? "automatic" : "by the house"}: {a.reason}</p>
                <p className="mt-3 whitespace-pre-wrap text-[15px] text-ivory">“{a.body}”</p>
                <div className="mt-4"><DecideAppeal id={a.id} /></div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="restr-h" className="mt-12">
        <h2 id="restr-h" className="font-display text-[28px] text-ivory">Paused accounts</h2>
        {restrictions.length === 0 ? <p className="mt-4 text-[14px] text-ash">No accounts are paused.</p> : (
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {restrictions.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-4 text-[14px]">
                <span>
                  <span className="text-ivory">{r.alias}</span> <span className="text-ash">until {when(r.until)}</span>
                  <span className="block text-[13px] text-stone">{r.automatic ? "Automatic · " : ""}{r.reason}</span>
                </span>
                <LiftButton id={r.id} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
