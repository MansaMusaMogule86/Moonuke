import type { Metadata } from "next";
import { Badge } from "@/components/ui/Badge";
import { requireViewer } from "@/server/auth/request";
import { listApplications, overview } from "@/server/services/admin";
import { DecisionRow } from "./ActionForms";

export const metadata: Metadata = { title: "Applications" };

const when = (d: Date) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function AdminHome() {
  const viewer = await requireViewer("applications.review");
  const [stats, apps] = await Promise.all([overview(viewer), listApplications(viewer)]);

  return (
    <div>
      <h1 className="font-display text-[48px] leading-none tracking-[-0.02em] text-ivory md:text-[72px]">
        Who <em className="text-metal">enters.</em>
      </h1>
      <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-lg)] border border-line bg-line sm:grid-cols-5">
        {[
          ["Awaiting approval", stats.pending_apps],
          ["Referral requests", stats.pending_refs],
          ["Open invitations", stats.active_invites],
          ["Active members", stats.active_members],
          ["Creators", stats.creators],
        ].map(([k, v]) => (
          <div key={k as string} className="bg-ink px-5 py-5 last:col-span-2 sm:last:col-span-1">
            <dt className="text-[12px] text-stone">{k}</dt>
            <dd className="mt-1 font-display text-[32px] tabular-nums text-ivory">{v}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="apps-h" className="mt-14">
        <h2 id="apps-h" className="font-display text-[30px] text-ivory">Awaiting approval</h2>
        <p className="mt-2 text-[14px] text-stone">An invitation only lets someone apply. Nobody enters until you approve them here.</p>
        {apps.length === 0 ? (
          <p className="mt-8 rounded-[var(--radius-lg)] border border-line p-8 text-center text-[15px] text-stone">No one is waiting. The door is quiet.</p>
        ) : (
          <ul className="mt-8 space-y-4">
            {apps.map((a) => (
              <li key={a.id} className="rounded-[var(--radius-lg)] border border-line bg-ink-2 p-5 md:p-6">
                <DecisionRow id={a.id} kind="application" label={a.alias} initialStatus={a.status}>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display text-[24px] text-ivory">{a.alias}</p>
                    <Badge tone={a.role === "creator" ? "vip" : "member"}>{a.role}</Badge>
                  </div>
                  <p className="mt-1 break-all text-[13px] text-stone">{a.email}</p>
                  <div className="mt-2 text-[13px] text-stone">
                    <p>Applied {when(a.submitted_at)}</p>
                    {a.referred_by && <p>Vouched for by <span className="text-ivory">{a.referred_by}</span></p>}
                    {a.invitation_note && <p className="truncate">Invite note: {a.invitation_note}</p>}
                  </div>
                </DecisionRow>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
