import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { requireViewer } from "@/server/auth/request";
import { takedownNotice } from "@/server/services/takedown";
import { uuid } from "@/server/validation";
import { RevealContact, TakedownDecision } from "../../SafetyForms";
import { label, when } from "../../SafetyNav";

export const metadata: Metadata = { title: "Takedown notice · House" };

export default async function NoticePage({ params }: { params: Promise<{ id: string }> }) {
  const owner = await requireViewer("moderation.review");
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const n = await takedownNotice(owner, id);
  if (!n) notFound();
  const open = n.status === "received" || n.status === "in_review";
  return (
    <div className="max-w-3xl">
      <Link href="/admin/safety" className="text-[13px] text-stone underline decoration-line-strong underline-offset-4 hover:text-ivory">← Takedown notices</Link>
      <h1 className="mt-6 font-mono text-[28px] text-ivory md:text-[36px]">{n.reference}</h1>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge tone="live">{label(n.category)}</Badge>
        <Badge>{label(n.status)}</Badge>
        <Badge>{label(n.requester_role)}</Badge>
      </div>
      <dl className="mt-8 grid gap-x-6 gap-y-3 text-[14px] sm:grid-cols-[180px_1fr]">
        <dt className="text-ash">Received</dt><dd className="text-ivory">{when(n.received_at)}</dd>
        <dt className="text-ash">Decide by</dt><dd className={n.overdue ? "text-danger" : "text-ivory"}>{when(n.due_at)}{open && ` (${n.hours_left} h left)`}</dd>
        <dt className="text-ash">Location given</dt><dd className="break-words text-ivory">{n.location}</dd>
        <dt className="text-ash">Matched content</dt>
        <dd className="text-ivory">{n.target_label ? `${n.target_label}${n.post_hidden ? " (currently hidden)" : ""}` : "None matched automatically. Find it from the description."}</dd>
        {n.description && (<><dt className="text-ash">Description</dt><dd className="whitespace-pre-wrap text-ivory">{n.description}</dd></>)}
        {n.duplicate_of && (<><dt className="text-ash">Duplicate of</dt><dd><Link href={`/admin/safety/takedown/${n.duplicate_of}`} className="underline underline-offset-4">first notice</Link></dd></>)}
        {n.duplicates > 0 && (<><dt className="text-ash">Linked notices</dt><dd className="text-ivory">{n.duplicates} (decided together)</dd></>)}
        {n.decision_note && (<><dt className="text-ash">Decision</dt><dd className="text-ivory">{n.decision_note}{n.copies_removed ? ` · ${n.copies_removed} identical copies removed` : ""}</dd></>)}
      </dl>
      <section aria-labelledby="contact-h" className="mt-10 rounded-[var(--radius-lg)] border border-line bg-ink-2 p-6">
        <h2 id="contact-h" className="font-display text-[22px] text-ivory">Requester</h2>
        <p className="mt-2 text-[13px] text-stone">Encrypted at rest. Showing it is recorded in the audit log.</p>
        <div className="mt-4"><RevealContact id={n.id} /></div>
      </section>
      {n.status === "escalated" ? (
        <p className="mt-8 rounded-[var(--radius-md)] border border-danger/40 bg-danger/[0.06] px-4 py-3 text-[14px] text-danger">
          Escalated to safeguarding. The content is withheld and preserved; it&apos;s decided there. <Link href="/admin/safety/safeguarding" className="underline underline-offset-4">Open safeguarding</Link>
        </p>
      ) : open ? (
        <section aria-labelledby="decide-h" className="mt-8 rounded-[var(--radius-lg)] border border-line bg-ink-2 p-6">
          <h2 id="decide-h" className="font-display text-[22px] text-ivory">Decision</h2>
          <p className="mt-2 text-[13px] text-stone">Removing hides the content and every known identical copy, and blocks that media from being published again. Nothing is deleted.</p>
          <div className="mt-4"><TakedownDecision id={n.id} status={n.status} /></div>
        </section>
      ) : null}
    </div>
  );
}
