import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { requestMeta, requireViewer } from "@/server/auth/request";
import { caseDetail, safeguardingAccess } from "@/server/services/safeguarding";
import { uuid } from "@/server/validation";
import { CaseActions, DraftExport, ReleaseHold } from "../../SafetyForms";
import { label, when } from "../../SafetyNav";

export const metadata: Metadata = { title: "Safeguarding case · House" };

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const owner = await requireViewer("moderation.review");
  const { id } = await params;
  if (!uuid.safeParse(id).success || !(await safeguardingAccess(owner)).trained) notFound();
  const d = await caseDetail(owner, id, await requestMeta());
  if (!d) notFound();
  const { c, events, holds } = d;
  return (
    <div className="max-w-3xl">
      <Link href="/admin/safety/safeguarding" className="text-[13px] text-stone underline decoration-line-strong underline-offset-4 hover:text-ivory">← Safeguarding</Link>
      <h1 className="mt-6 font-mono text-[28px] text-ivory md:text-[36px]">{c.reference}</h1>
      <div className="mt-3 flex flex-wrap gap-2"><Badge tone="live">{label(c.status)}</Badge><Badge>from {c.source_type}</Badge></div>
      <p className="mt-6 text-[15px] text-ivory">{c.summary}</p>
      <p className="mt-2 text-[13px] text-stone">
        Opened {when(c.created_at)} ({c.hours_open} h ago){c.external_ref ? ` · CyberTipline report ${c.external_ref}` : ""}
        {c.decision_reason ? ` · ${c.decision_reason}` : ""}
      </p>
      <p className="mt-6 rounded-[var(--radius-md)] border border-line bg-ink-2 px-4 py-3 text-[13px] text-stone">
        Content isn&apos;t displayed here. Preserved records hold identifiers, timestamps and media fingerprints. Follow your verified procedure
        before viewing any material, and never download, forward or copy it.
      </p>

      <section aria-labelledby="act-h" className="mt-8 rounded-[var(--radius-lg)] border border-line bg-ink-2 p-6">
        <h2 id="act-h" className="font-display text-[22px] text-ivory">Decision</h2>
        <div className="mt-4"><CaseActions id={c.id} status={c.status} /></div>
      </section>

      <section aria-labelledby="draft-h" className="mt-8 rounded-[var(--radius-lg)] border border-line bg-ink-2 p-6">
        <h2 id="draft-h" className="font-display text-[22px] text-ivory">CyberTipline preparation</h2>
        <p className="mt-2 text-[13px] text-stone">A checklist for manual entry. External submission is disabled in this system.</p>
        <div className="mt-4"><DraftExport id={c.id} /></div>
      </section>

      <section aria-labelledby="holds-h" className="mt-8">
        <h2 id="holds-h" className="font-display text-[22px] text-ivory">Legal holds</h2>
        <ul className="mt-4 space-y-3">
          {holds.map((h) => (
            <li key={h.id} className="rounded-[var(--radius-lg)] border border-line bg-ink-2 p-5 text-[14px]">
              <p className="text-ivory">{label(h.object_type)} <span className="font-mono text-[12px] text-stone">{h.object_id}</span></p>
              <p className="mt-1 text-[13px] text-stone">
                Preserved {when(h.placed_at)} · until at least {when(h.preserve_until)}{h.released_at ? ` · released ${when(h.released_at)}` : ""}
              </p>
              {!h.released_at && c.status === "closed" && new Date(h.preserve_until) <= new Date() && <div className="mt-3"><ReleaseHold id={h.id} /></div>}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="log-h" className="mt-8">
        <h2 id="log-h" className="font-display text-[22px] text-ivory">Case log</h2>
        <ol className="mt-4 divide-y divide-line border-y border-line">
          {events.map((e) => (
            <li key={e.id} className="py-3 text-[14px]">
              <span className="text-ivory">{label(e.kind)}</span> <span className="text-stone">· {e.actor ?? "system"} · {when(e.created_at)}</span>
              {e.note && <p className="mt-1 text-[13px] text-stone">{e.note}</p>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
