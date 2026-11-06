import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { requireViewer } from "@/server/auth/request";
import { myConsents, myParticipants } from "@/server/services/participants";
import { AddConsentForm, AddParticipantForm, WithdrawConsent } from "./ParticipantForms";

export const metadata: Metadata = { title: "Participants · Studio" };

const STATUS = { pending: "Waiting for verification", verified: "Verified", rejected: "Not verified", revoked: "Verification revoked" } as const;

export default async function StudioParticipantsPage() {
  const viewer = await requireViewer("club.discover");
  if (viewer.role !== "creator") notFound();
  const people = await myParticipants(viewer);
  const consents = new Map(await Promise.all(people.map(async (p) => [p.id, await myConsents(viewer, p.id)] as const)));
  return (
    <div className="mx-auto max-w-[800px] px-5 pb-28 pt-14 md:px-10 md:pt-20">
      <Link href="/studio" className="text-[13px] text-stone underline decoration-line-strong underline-offset-4 hover:text-ivory">← Studio</Link>
      <h1 className="mt-6 font-display text-[44px] leading-none tracking-[-0.03em] text-ivory md:text-[64px]">Participants</h1>
      <p className="mt-4 text-[14px] leading-relaxed text-stone">
        Record everyone other than you who appears in your content. Each person must be 18 or older, verified by the house, and have given
        consent for the content they appear in. If someone withdraws consent, every post that relies on it is hidden at once.
      </p>

      {people.length > 0 && (
        <ul className="mt-10 space-y-4">
          {people.map((p) => (
            <li key={p.id} className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-[24px] text-ivory">{p.label}</h2>
                <Badge tone={p.status === "verified" ? "vip" : p.status === "pending" ? "neutral" : "live"}>{STATUS[p.status]}</Badge>
                <span className="text-[13px] text-stone">{p.posts} {p.posts === 1 ? "post" : "posts"}</span>
              </div>
              {p.review_note && <p className="mt-2 text-[13px] text-stone">House note: {p.review_note}</p>}
              <h3 className="eyebrow mt-6 text-stone">Consents</h3>
              {(consents.get(p.id) ?? []).length === 0 ? <p className="mt-2 text-[14px] text-ash">None recorded.</p> : (
                <ul className="mt-2 divide-y divide-line border-y border-line">
                  {(consents.get(p.id) ?? []).map((c) => (
                    <li key={c.id} className="py-3 text-[14px]">
                      <p className="text-ivory">{c.scope} <span className="text-stone">· signed {c.signed_on}</span></p>
                      {c.withdrawn_at ? (
                        <p className="mt-1 text-[13px] text-danger">Withdrawn{c.withdrawal_reason ? `: ${c.withdrawal_reason}` : ""}</p>
                      ) : (
                        <div className="mt-2"><WithdrawConsent consentId={c.id} /></div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {(p.status === "pending" || p.status === "verified") && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-[14px] text-gold-soft">Record a consent</summary>
                  <div className="mt-4"><AddConsentForm participantId={p.id} /></div>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="add-h" className="mt-10 rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-9">
        <h2 id="add-h" className="font-display text-[26px] text-ivory">Add a person</h2>
        <div className="mt-6"><AddParticipantForm /></div>
      </section>
    </div>
  );
}
