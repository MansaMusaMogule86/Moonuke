import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { requireViewer } from "@/server/auth/request";
import { myBlasts, myLists, myTemplates, segmentCounts, SEGMENTS } from "@/server/services/blasts";
import { BlastComposer, CancelBlast, DeleteTemplate } from "./BlastForms";

export const metadata: Metadata = { title: "Blasts · Studio" };
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

export default async function BlastsPage() {
  const viewer = await requireViewer("club.discover");
  if (viewer.role !== "creator") notFound();
  const [counts, lists, templates, blasts] = [await segmentCounts(viewer), await myLists(viewer), await myTemplates(viewer), await myBlasts(viewer)];
  return (
    <div className="mx-auto max-w-[1100px] px-5 pb-28 pt-14 md:px-10 md:pt-20">
      <Link href="/studio" className="text-[13px] text-stone underline decoration-line-strong underline-offset-4 hover:text-ivory">← Studio</Link>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-[48px] leading-none tracking-[-0.03em] text-ivory md:text-[72px]">Blasts</h1>
        <Link href="/studio/blasts/lists" className="text-[14px] text-gold underline decoration-gold/40 underline-offset-4">Custom lists</Link>
      </div>
      <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-stone">Write once; each person receives it as a private message in their own conversation with you.</p>
      <div className="mt-10 grid gap-6 lg:grid-cols-12">
        <section aria-labelledby="compose-h" className="rounded-[var(--radius-xl)] border border-gold/30 bg-ink-2 p-6 md:p-8 lg:col-span-7">
          <h2 id="compose-h" className="font-display text-[28px] text-ivory">New Blast</h2>
          <div className="mt-6"><BlastComposer counts={counts} lists={lists.map((l) => ({ id: l.id, name: l.name, size: l.members.length }))} templates={templates} /></div>
        </section>
        <section aria-labelledby="tpl-h" className="h-fit rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-8 lg:col-span-5">
          <h2 id="tpl-h" className="font-display text-[24px] text-ivory">Templates</h2>
          {templates.length === 0 ? <p className="mt-4 text-[14px] text-ash">None yet. Save one from the composer.</p> : (
            <ul className="mt-4 divide-y divide-line">
              {templates.map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-3 py-3">
                  <span className="min-w-0"><span className="block text-[14px] text-ivory">{t.name}</span><span className="block truncate text-[12px] text-ash">{t.body}</span></span>
                  <DeleteTemplate id={t.id} name={t.name} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <section aria-labelledby="hist-h" className="mt-10">
        <h2 id="hist-h" className="font-display text-[28px] text-ivory">History</h2>
        {blasts.length === 0 ? <p className="mt-4 text-[14px] text-ash">No Blasts yet.</p> : (
          <ul className="mt-4 divide-y divide-line border-y border-line" aria-label="Your Blasts">
            {blasts.map((b) => (
              <li key={b.id} className="flex flex-wrap items-start justify-between gap-4 py-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={b.status === "sent" ? "vip" : b.status === "canceled" ? "locked" : "member"}>{b.status}</Badge>
                    <Badge tone="neutral">{b.segment === "list" ? `List: ${b.listName ?? "deleted"}` : SEGMENTS[b.segment]}</Badge>
                    <span className="text-[12px] text-ash">{b.status === "scheduled" ? `Sends ${when(b.scheduledAt)}` : when(b.scheduledAt)}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-[14px] text-ivory">{b.body}</p>
                  {(b.status === "sent" || b.status === "sending") && (
                    <p className="mt-2 text-[12px] text-stone">
                      {b.delivered} delivered · {b.skipped} skipped · {b.failed} failed · {b.read} read · {b.replies} replied
                    </p>
                  )}
                </div>
                {b.status === "scheduled" && <CancelBlast id={b.id} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
