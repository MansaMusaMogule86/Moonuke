import type { Metadata } from "next";
import { Badge } from "@/components/ui/Badge";
import { requireViewer } from "@/server/auth/request";
import { listMembers } from "@/server/services/admin";
import { SuspendForm } from "../ActionForms";

export const metadata: Metadata = { title: "Members" };

const statusTone = { active: "member", pending: "neutral", suspended: "live", rejected: "locked" } as const;

export default async function MembersPage() {
  const viewer = await requireViewer("accounts.suspend");
  const people = await listMembers(viewer);

  return (
    <div>
      <h1 className="font-display text-[40px] leading-none text-ivory md:text-[56px]">
        The <em className="text-metal">register</em>
      </h1>
      <p className="mt-4 max-w-2xl text-[14px] text-stone">Suspending an account signs it out everywhere immediately. Every action is recorded in the audit log.</p>
      <ul className="mt-8 divide-y divide-line border-y border-line">
        {people.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[15px] text-ivory">{u.alias}</p>
                <Badge tone={u.role === "owner" ? "vip" : "neutral"}>{u.role}</Badge>
                <Badge tone={statusTone[u.status]}>{u.status}</Badge>
              </div>
              <p className="mt-1 break-all text-[12px] text-ash">
                {u.email} · joined {new Date(u.created_at).toLocaleDateString("en-GB")}
                {u.suspended_reason ? ` · ${u.suspended_reason}` : ""}
              </p>
            </div>
            {u.role !== "owner" && (u.status === "active" || u.status === "suspended") && (
              <SuspendForm id={u.id} suspended={u.status === "suspended"} alias={u.alias} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
