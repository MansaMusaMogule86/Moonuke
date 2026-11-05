import type { Metadata } from "next";
import { requireViewer } from "@/server/auth/request";
import { emailEnabled } from "@/server/email/outbox";
import { listReferrals } from "@/server/services/admin";
import { DecisionRow } from "../ActionForms";

export const metadata: Metadata = { title: "Referrals" };

export default async function ReferralsPage() {
  const viewer = await requireViewer("referrals.review");
  const refs = await listReferrals(viewer);

  return (
    <div>
      <h1 className="font-display text-[40px] leading-none text-ivory md:text-[56px]">
        Requests to <em className="text-metal">vouch</em>
      </h1>
      <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-stone">
        Members and creators can ask you to invite someone. Approving issues a single-use invitation locked to the
        invitee&apos;s email, valid for 7 days — the link is shown to you only.
      </p>
      {refs.length === 0 ? (
        <p className="mt-8 text-[14px] text-stone">No requests.</p>
      ) : (
        <ul className="mt-8 space-y-4">
          {refs.map((r) => (
            <li key={r.id} className="rounded-[var(--radius-lg)] border border-line bg-ink-2 p-5 md:p-6">
              <DecisionRow id={r.id} kind="referral" label={r.invitee_name} initialStatus={r.status} emailEnabled={emailEnabled()}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-display text-[22px] text-ivory">{r.invitee_name}</p>
                  <span className="text-[12px] uppercase tracking-[0.16em] text-ash">as {r.intended_role}</span>
                </div>
                <p className="mt-1 break-all text-[13px] text-stone">{r.invitee_email}</p>
                <p className="mt-3 text-[14px] leading-relaxed text-ivory/85">“{r.relationship}”</p>
                <p className="mt-2 text-[12px] text-ash">Requested by {r.requester_alias} ({r.requester_role}) · {new Date(r.created_at).toLocaleDateString("en-GB")}</p>
              </DecisionRow>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
