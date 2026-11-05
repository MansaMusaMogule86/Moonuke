import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/server/auth/request";
import { reportedMessageContext } from "@/server/services/messaging";
import { asViewer } from "@/server/db";
import { uuid } from "@/server/validation";
import { ExceptionalAccess, ReportedMessageActions, RestrictForm } from "../../MessagingForms";

export const metadata: Metadata = { title: "Reported message · House" };

const when = (d: Date) => new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

export default async function ReportedMessagePage({ params }: { params: Promise<{ id: string }> }) {
  const owner = await requireViewer("moderation.review");
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const ctx = await reportedMessageContext(owner, id);
  const target = ctx.find((m) => m.is_reported);
  if (!target) notFound();
  const meta = await asViewer(owner, (q) =>
    q.one<{ reason: string; details: string | null; reporter: string; sender_alias: string; sender_id: string }>(
      `select r.reason::text as reason, r.details, ru.alias::text as reporter, su.alias::text as sender_alias, su.id as sender_id
         from app.reports r join app.users ru on ru.id = r.reporter_id join app.users su on su.id = r.target_user_id where r.id = $1`,
      [id],
    ),
  );
  if (!meta) notFound();

  return (
    <div>
      <Link href="/admin/moderation" className="text-[13px] text-stone underline decoration-line-strong underline-offset-4 hover:text-ivory">← Moderation</Link>
      <h1 className="mt-6 font-display text-[36px] leading-none text-ivory md:text-[48px]">Reported message</h1>
      <p className="mt-3 text-[14px] text-stone">
        Reported by <span className="text-ivory">{meta.reporter}</span> for <span className="text-ivory">{meta.reason.replace(/_/g, " ")}</span>. Sender: <span className="text-ivory">{meta.sender_alias}</span>.
        {meta.details && <span className="mt-2 block">“{meta.details}”</span>}
      </p>
      <p className="mt-2 text-[12px] text-ash">You&apos;re seeing the reported message and up to three nearby messages from the same day. This view was recorded in the audit log.</p>
      <ol className="mt-6 space-y-3" aria-label="Reported message and context">
        {ctx.map((m) => (
          <li key={m.id} className={m.is_reported ? "rounded-[var(--radius-lg)] border border-danger/50 bg-danger/[0.05] p-4" : "rounded-[var(--radius-lg)] border border-line p-4"}>
            <p className="text-[12px] text-ash">{m.sender_id === meta.sender_id ? meta.sender_alias : "Other participant"} · {when(m.created_at)}{m.is_reported ? " · reported" : ""}{m.status !== "sent" ? ` · ${m.status}` : ""}</p>
            <p className="mt-2 whitespace-pre-wrap break-words text-[15px] text-ivory">{m.body}</p>
          </li>
        ))}
      </ol>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="act-h" className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6">
          <h2 id="act-h" className="font-display text-[24px] text-ivory">The message</h2>
          <div className="mt-4"><ReportedMessageActions reportId={id} messageId={target.id} status={target.status} /></div>
          <p className="mt-4 text-[12px] text-ash">Close the report itself from the Moderation queue.</p>
        </section>
        <section aria-labelledby="acct-h" className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6">
          <h2 id="acct-h" className="font-display text-[24px] text-ivory">The sender</h2>
          <div className="mt-4"><RestrictForm userId={meta.sender_id} name={meta.sender_alias} /></div>
        </section>
      </div>
      <div className="mt-10"><ExceptionalAccess reportId={id} senderId={meta.sender_id} senderName={meta.sender_alias} /></div>
    </div>
  );
}
