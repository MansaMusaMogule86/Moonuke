import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { requireViewer } from "@/server/auth/request";
import { getEvent } from "@/server/services/securityMonitor";
import { dubai, EVENT_LABEL, EventList, SEVERITY_TONE } from "../../shared";

export const metadata: Metadata = { title: "Security event" };

export default async function SecurityEventPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer("security.view");
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) notFound();
  const found = await getEvent(viewer, id); // viewing is audited
  if (!found) notFound();
  const { event: e, related, alerts } = found;
  const rows: [string, string][] = [
    ["When", `${dubai(e.occurred_at)} Dubai (${new Date(e.occurred_at).toISOString()})`],
    ["Account", e.alias ?? (e.account_matched ? "No account (attempt matched by keyed hash only)" : "—")],
    ["Network", e.ip_prefix ?? "Unknown (no trusted proxy)"],
    ["Approximate location", [e.ip_country, e.ip_region].filter(Boolean).join("-") || "Unknown"],
    ["Device", `${e.browser_family ?? "?"} on ${e.os_family ?? "?"} (${e.device_category ?? "?"})${e.new_device ? ", new device type" : ""}`],
    ["Session reference", e.session_ref ?? "—"],
    ["Correlation ID", e.correlation_id],
    ["Details", Object.entries(e.metadata).map(([k, v]) => `${k.replace(/_/g, " ")}: ${String(v)}`).join(" · ") || "—"],
  ];
  return (
    <div>
      <Link href="/admin/security/events" className="text-[13px] text-gold-soft underline underline-offset-4">← Event explorer</Link>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-[36px] leading-none text-ivory md:text-[48px]">{EVENT_LABEL[e.event_type] ?? e.event_type}</h1>
        <Badge tone={SEVERITY_TONE[e.severity as keyof typeof SEVERITY_TONE] ?? "neutral"}>{e.severity}</Badge>
      </div>
      <dl className="mt-8 grid max-w-3xl gap-x-6 gap-y-3 text-[14px] sm:grid-cols-[200px_1fr]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-stone">{k}</dt>
            <dd className="break-words text-ivory">{v}</dd>
          </div>
        ))}
      </dl>
      {alerts.length > 0 && (
        <section aria-labelledby="event-alerts" className="mt-10">
          <h2 id="event-alerts" className="font-display text-[24px] text-ivory">Alerts from this event</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {alerts.map((a) => <li key={a.id}><Badge tone={SEVERITY_TONE[a.severity as keyof typeof SEVERITY_TONE] ?? "neutral"}>{`${a.alert_type.replace(/_/g, " ")} · ${a.status}`}</Badge></li>)}
          </ul>
        </section>
      )}
      <section aria-labelledby="event-related" className="mt-10">
        <h2 id="event-related" className="font-display text-[24px] text-ivory">Same request</h2>
        <EventList rows={related} />
      </section>
    </div>
  );
}
