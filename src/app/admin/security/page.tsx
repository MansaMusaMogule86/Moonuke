import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { requireViewer } from "@/server/auth/request";
import { getSettings, listAlerts, securityOverview } from "@/server/services/securityMonitor";
import { AlertControls, SettingsForm } from "./SecurityForms";
import { EventList, SEVERITY_TONE } from "./shared";

export const metadata: Metadata = { title: "Security" };

export default async function SecurityPage() {
  const viewer = await requireViewer("security.view");
  const [o, alerts, settings] = await Promise.all([securityOverview(viewer), listAlerts(viewer), getSettings(viewer)]);
  const stats: [string, number, string?][] = [
    ["Successful sign-ins · 24 h", o.totals.logins],
    ["New registrations · 24 h", o.totals.registrations],
    ["Creator applications awaiting review", o.totals.pendingCreators, "/admin"],
    ["Failed sign-in attempts · 24 h", o.totals.failed],
    ["Open alerts", o.totals.open],
    ["Critical alerts open", o.totals.critical],
  ];

  return (
    <div>
      <h1 className="font-display text-[40px] leading-none text-ivory md:text-[56px]">
        Security <em className="text-metal">monitoring</em>
      </h1>
      <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-stone">
        Server-side records of sign-ins, registrations, creator applications and suspicious sign-in activity. No raw IP
        addresses, emails or tokens are stored; locations come from the hosting network and are approximate. Owner only.
      </p>

      <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map(([label, n, href]) => (
          <li key={label} className="rounded-[var(--radius-lg)] border border-line bg-ink-2 p-5">
            <p className="text-[13px] text-stone">{label}</p>
            <p className="mt-2 font-display text-[36px] leading-none text-ivory">{n}</p>
            {href && <Link href={href} className="mt-2 inline-block text-[13px] text-gold-soft underline underline-offset-4">Review</Link>}
          </li>
        ))}
      </ul>

      <section aria-labelledby="alerts-title" className="mt-14">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="alerts-title" className="font-display text-[28px] text-ivory">Alerts needing action</h2>
          <Link href="/admin/security/events" className="text-[14px] text-gold-soft underline underline-offset-4">Explore all events</Link>
        </div>
        {alerts.length === 0 ? (
          <p className="mt-4 text-[14px] text-stone">No open alerts.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {alerts.map((a) => (
              <li key={a.id} className="py-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge tone={SEVERITY_TONE[a.severity as keyof typeof SEVERITY_TONE] ?? "neutral"}>{a.severity}</Badge>
                  <Badge>{a.status}</Badge>
                  <span className="text-[12px] text-ash">
                    {a.alert_type.replace(/_/g, " ")} · {new Date(a.created_at).toLocaleString("en-GB", { timeZone: "Asia/Dubai" })} Dubai
                    {a.notified ? " · emailed" : ""}
                  </span>
                </div>
                <p className="mt-2 text-[15px] text-ivory">{a.summary}</p>
                {a.note && <p className="mt-1 text-[13px] text-stone">Note: {a.note}</p>}
                {a.source_event_id && (
                  <Link href={`/admin/security/events/${a.source_event_id}`} className="mt-1 inline-block text-[13px] text-gold-soft underline underline-offset-4">
                    View event
                  </Link>
                )}
                <AlertControls id={a.id} status={a.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-14 grid gap-10 lg:grid-cols-2">
        <section aria-labelledby="countries-title">
          <h2 id="countries-title" className="font-display text-[24px] text-ivory">Sign-ins by country · 24 h</h2>
          {o.countries.length === 0 ? (
            <p className="mt-3 text-[14px] text-stone">No country data. It appears when the host provides it (Vercel or Cloudflare).</p>
          ) : (
            <ul className="mt-3 space-y-1 text-[14px] text-ivory">
              {o.countries.map((c) => <li key={c.country}>{c.country} · {c.n}</li>)}
            </ul>
          )}
        </section>
        <section aria-labelledby="delivery-title">
          <h2 id="delivery-title" className="font-display text-[24px] text-ivory">Alert email delivery · 7 days</h2>
          {o.delivery.length === 0 ? (
            <p className="mt-3 text-[14px] text-stone">No security emails yet.</p>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-2">
              {o.delivery.map((d) => <li key={d.status}><Badge tone={d.status === "failed" ? "live" : d.status === "sent" ? "member" : "neutral"}>{`${d.status} · ${d.n}`}</Badge></li>)}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="recent-title" className="mt-14">
        <h2 id="recent-title" className="font-display text-[28px] text-ivory">Recent events</h2>
        <EventList rows={o.recent} />
      </section>

      <section aria-labelledby="settings-title" className="mt-14 max-w-3xl">
        <h2 id="settings-title" className="font-display text-[28px] text-ivory">Alert thresholds</h2>
        <p className="mt-2 text-[14px] text-stone">
          High and critical alerts are emailed immediately; everything else is in the daily digest. Retention is
          {settings.retention_enabled ? ` on (${settings.routine_retention_days} / ${settings.incident_retention_days} days).` : " off until the periods are approved."}
        </p>
        <div className="mt-6">
          <SettingsForm settings={{ ...settings, digest_local_time: String(settings.digest_local_time) }} />
        </div>
      </section>
    </div>
  );
}
