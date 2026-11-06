import type { Metadata } from "next";
import { Badge } from "@/components/ui/Badge";
import { requireViewer } from "@/server/auth/request";
import { participantQueue } from "@/server/services/participants";
import { ParticipantDecision, RevealIdentity } from "../SafetyForms";
import { SafetyNav, when } from "../SafetyNav";

export const metadata: Metadata = { title: "Participants · House" };

export default async function ParticipantsPage() {
  const owner = await requireViewer("moderation.review");
  const rows = await participantQueue(owner);
  const pending = rows.filter((r) => r.status === "pending").length;
  return (
    <div>
      <h1 className="font-display text-[40px] leading-none text-ivory md:text-[56px]">Participants</h1>
      <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-stone">
        People who appear in creators&apos; content. Identity details are encrypted; showing them requires a reason and is recorded. No ID
        documents are stored here yet: verification against a document needs an approved vendor or private storage.
      </p>
      <SafetyNav current="participants" counts={{ participants: pending }} />
      {rows.length === 0 ? <p className="mt-8 text-[14px] text-ash">No participants recorded.</p> : (
        <ul className="mt-8 space-y-3">
          {rows.map((p) => (
            <li key={p.id} className="rounded-[var(--radius-lg)] border border-line bg-ink-2 p-5">
              <div className="flex flex-wrap items-center gap-2 text-[13px] text-stone">
                <span className="text-ivory">{p.label}</span> · for {p.creator_name} · added {when(p.created_at)}
                <Badge tone={p.status === "verified" ? "vip" : p.status === "pending" ? "neutral" : "live"}>{p.status}</Badge>
                <span>{p.consents} active {p.consents === 1 ? "consent" : "consents"} · {p.posts} {p.posts === 1 ? "post" : "posts"}</span>
              </div>
              {(p.status === "pending" || p.status === "verified") && (
                <div className="mt-4 grid gap-6 md:grid-cols-2">
                  <RevealIdentity id={p.id} />
                  <ParticipantDecision id={p.id} status={p.status} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
