import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import type { EventRow } from "@/server/services/securityMonitor";

export const SEVERITY_TONE = { info: "neutral", warning: "member", high: "vip", critical: "live" } as const;

export const EVENT_LABEL: Record<string, string> = {
  "auth.login.success": "Signed in",
  "auth.login.failed": "Failed sign-in",
  "auth.login.blocked": "Blocked account tried to sign in",
  "auth.mfa.failed": "Failed second factor",
  "auth.registration.completed": "Registration completed",
  "creator.application.submitted": "Creator application",
};

export const dubai = (d: Date) => new Date(d).toLocaleString("en-GB", { timeZone: "Asia/Dubai" });

export function EventList({ rows }: { rows: EventRow[] }) {
  if (rows.length === 0) return <p className="mt-4 text-[14px] text-stone">No events.</p>;
  return (
    <ul className="mt-4 divide-y divide-line border-y border-line">
      {rows.map((e) => (
        <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <Link href={`/admin/security/events/${e.id}`} className="text-[14px] text-ivory underline-offset-4 hover:underline">
              {EVENT_LABEL[e.event_type] ?? e.event_type}
              {e.alias ? ` · ${e.alias}` : ""}
            </Link>
            <p className="mt-1 text-[12px] text-ash">
              {dubai(e.occurred_at)} Dubai · {e.ip_country ?? "country unknown"}
              {e.ip_region ? `-${e.ip_region}` : ""} · {e.browser_family ?? "?"} on {e.os_family ?? "?"} ({e.device_category ?? "?"})
              {e.new_device ? " · new device type" : ""}
            </p>
          </div>
          <Badge tone={SEVERITY_TONE[e.severity as keyof typeof SEVERITY_TONE] ?? "neutral"}>{e.severity}</Badge>
        </li>
      ))}
    </ul>
  );
}
