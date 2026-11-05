import type { Metadata } from "next";
import { Badge } from "@/components/ui/Badge";
import { requireViewer } from "@/server/auth/request";
import { emailEnabled } from "@/server/email/outbox";
import { listInvitations } from "@/server/services/admin";
import { CreateInvitationForm, RevokeForm } from "../ActionForms";

export const metadata: Metadata = { title: "Invitations" };

const tone = { active: "vip", expired: "neutral", revoked: "locked", exhausted: "neutral" } as const;
const day = (d: Date) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function InvitationsPage() {
  const viewer = await requireViewer("invitations.manage");
  const invites = await listInvitations(viewer);

  return (
    <div className="grid gap-14 lg:grid-cols-12 lg:gap-10">
      <section aria-labelledby="new-h" className="lg:col-span-5">
        <h1 id="new-h" className="font-display text-[40px] leading-none text-ivory md:text-[56px]">
          Issue an <em className="text-metal">invitation</em>
        </h1>
        <p className="mt-4 text-[14px] leading-relaxed text-stone">
          Links are random 256-bit tokens; only their hash is stored, so the link is shown once. An invitation lets
          someone <em>apply</em> — you still approve each account.
        </p>
        <div className="mt-8 rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-8">
          <CreateInvitationForm emailEnabled={emailEnabled()} />
        </div>
      </section>

      <section aria-labelledby="list-h" className="lg:col-span-7">
        <h2 id="list-h" className="font-display text-[30px] text-ivory">All invitations</h2>
        {invites.length === 0 ? (
          <p className="mt-6 text-[14px] text-stone">None yet.</p>
        ) : (
          <ul className="mt-6 divide-y divide-line border-y border-line">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={tone[i.state]}>{i.state}</Badge>
                    <span className="text-[14px] capitalize text-ivory">{i.intended_role}</span>
                    {i.email && <span className="break-all text-[13px] text-stone">· {i.email}</span>}
                  </div>
                  <p className="mt-1 text-[12px] text-ash">
                    {i.use_count}/{i.max_uses} used · expires {day(i.expires_at)}
                    {i.note ? ` · ${i.note}` : ""}
                  </p>
                </div>
                {i.state === "active" && <RevokeForm id={i.id} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
