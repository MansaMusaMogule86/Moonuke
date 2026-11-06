import type { Metadata } from "next";
import { Badge } from "@/components/ui/Badge";
import { requireViewer } from "@/server/auth/request";
import { staffActivity, staffOverview } from "@/server/services/staff";
import { GrantForm, RevokeForm, SwitchForm } from "./StaffForms";

export const metadata: Metadata = { title: "Staff · House" };
const when = (d: Date) => new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";

export default async function StaffPage() {
  const owner = await requireViewer("moderation.review");
  const [o, log] = [await staffOverview(owner), await staffActivity(owner)];
  return (
    <div>
      <h1 className="font-display text-[40px] leading-none text-ivory md:text-[56px]">Staff</h1>
      <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-stone">
        Restricted moderators: members with two-step sign-in and a subset of capabilities. They never get your powers: suspensions,
        safeguarding, identity and requester details, settings and grants stay with you. Everything they do, including what they view, is in
        the audit log.
      </p>
      <div className="mt-8 flex flex-wrap gap-2" data-testid="staff-status">
        <Badge tone={o.flag ? "live" : "neutral"}>Server flag: {o.flag ? "on" : "off (awaiting approval)"}</Badge>
        <Badge tone={o.enabled ? "live" : "neutral"}>Your switch: {o.enabled ? "on" : "off"}</Badge>
      </div>
      {o.flag && <div className="mt-6"><SwitchForm enabled={o.enabled} /></div>}

      <section aria-labelledby="grants-h" className="mt-10">
        <h2 id="grants-h" className="font-display text-[28px] text-ivory">Moderators</h2>
        {o.grants.length === 0 ? <p className="mt-4 text-[14px] text-ash">No moderators.</p> : (
          <ul className="mt-4 space-y-3">
            {o.grants.map((g) => (
              <li key={g.user_id} className="rounded-[var(--radius-lg)] border border-line bg-ink-2 p-5 text-[14px]">
                <p className="text-ivory">{g.alias} <span className="text-stone">· {g.email}</span></p>
                <p className="mt-1 text-[13px] text-stone">{g.capabilities.join(", ")} · granted {when(g.granted_at)} · {g.actions} recorded actions</p>
                {g.revoked_at ? <p className="mt-1 text-[13px] text-danger">Revoked {when(g.revoked_at)}{g.revoke_reason ? `: ${g.revoke_reason}` : ""}</p> : <div className="mt-3"><RevokeForm userId={g.user_id} /></div>}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-6 rounded-[var(--radius-lg)] border border-line bg-ink-2 p-5"><GrantForm approved={o.flag} /></div>
      </section>

      <section aria-labelledby="log-h" className="mt-10">
        <h2 id="log-h" className="font-display text-[28px] text-ivory">Moderator activity</h2>
        {log.length === 0 ? <p className="mt-4 text-[14px] text-ash">Nothing recorded.</p> : (
          <ol className="mt-4 divide-y divide-line border-y border-line">
            {log.map((a) => (
              <li key={a.id} className="py-3 text-[14px]"><span className="text-ivory">{a.actor}</span> <span className="text-stone">· {a.action} · {a.target_type ?? ""} · {when(a.created_at)}</span></li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
