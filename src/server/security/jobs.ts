import "server-only";
import { system } from "@/server/db";
import { enqueue } from "@/server/email/outbox";
import { emails } from "@/server/email/templates";
import { appUrl } from "@/server/env";
import { loadSettings } from "./monitor";

/** Local calendar date and HH:MM in a time zone (events themselves are stored in UTC). */
export function localParts(now: Date, timeZone: string): { day: string; hm: string } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  return { day: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}` };
}

/**
 * Daily summary to the owner. Safe to run as often as you like: it sends
 * once per local day, the first time it runs at or after the configured time.
 */
export async function runSecurityDigest(now = new Date()): Promise<{ sent: boolean; day: string }> {
  return system(async (q) => {
    const s = await loadSettings(q);
    const { day, hm } = localParts(now, s.digest_timezone);
    if (hm < s.digest_local_time.slice(0, 5)) return { sent: false, day };
    const owner = await q.one<{ id: string; email: string }>(`select id, email::text as email from app.users where role = 'owner' and status = 'active'`);
    if (!owner) return { sent: false, day };
    const t = await q.one<{
      logins: number; accounts: number; registrations: number; creator_applications: number; failed: number;
    }>(
      `select count(*) filter (where event_type = 'auth.login.success')::int as logins,
              count(distinct actor_user_id) filter (where event_type = 'auth.login.success')::int as accounts,
              count(*) filter (where event_type = 'auth.registration.completed')::int as registrations,
              count(*) filter (where event_type = 'creator.application.submitted')::int as creator_applications,
              count(*) filter (where event_type in ('auth.login.failed', 'auth.login.blocked', 'auth.mfa.failed'))::int as failed
         from app.security_events where occurred_at > $1::timestamptz - interval '24 hours' and occurred_at <= $1::timestamptz`,
      [now],
    );
    const a = await q.one<{ alerts: number; high: number; open: number }>(
      `select count(*) filter (where created_at > $1::timestamptz - interval '24 hours')::int as alerts,
              count(*) filter (where created_at > $1::timestamptz - interval '24 hours' and severity in ('high', 'critical'))::int as high,
              count(*) filter (where status <> 'resolved')::int as open
         from app.security_alerts`,
      [now],
    );
    const countries = await q.query<{ country: string; n: number }>(
      `select ip_country as country, count(*)::int as n from app.security_events
        where event_type = 'auth.login.success' and ip_country is not null
          and occurred_at > $1::timestamptz - interval '24 hours' and occurred_at <= $1::timestamptz
        group by 1 order by 2 desc, 1 limit 10`,
      [now],
    );
    const id = await enqueue(
      q,
      owner.email,
      emails.securityDigest({
        day,
        timezone: s.digest_timezone,
        totals: {
          logins: t!.logins, accounts: t!.accounts, registrations: t!.registrations, creatorApplications: t!.creator_applications,
          failed: t!.failed, alerts: a!.alerts, high: a!.high, openAlerts: a!.open,
        },
        countries,
        url: `${appUrl()}/admin/security`,
      }),
      owner.id,
      { dedupeKey: `security_digest:${day}` },
    );
    return { sent: id !== null, day };
  });
}

export type RetentionReport = { enabled: boolean; events: number; alerts: number; emails: number };

/**
 * Removes expired security telemetry, only when retention_enabled is true
 * (it ships off until the periods are approved; until then this only
 * reports what it WOULD remove). Touches nothing outside the security
 * tables and the security email templates. Events an unresolved alert
 * points to, or any alert younger than the incident period, are kept.
 */
export async function runSecurityRetention(now = new Date()): Promise<RetentionReport> {
  return system(async (q) => {
    const s = await loadSettings(q);
    const events = `from app.security_events e
      where (e.retention_class = 'routine' and e.occurred_at < $1::timestamptz - make_interval(days => $2)
          or e.retention_class = 'incident' and e.occurred_at < $1::timestamptz - make_interval(days => $3))
        and not exists (select 1 from app.security_alerts a where a.source_event_id = e.id
                          and (a.status <> 'resolved' or a.created_at >= $1::timestamptz - make_interval(days => $3)))`;
    // Every statement takes the same three parameters ($1 now, $2 routine days, $3 incident days).
    const alerts = `from app.security_alerts where status = 'resolved' and resolved_at < $1::timestamptz - make_interval(days => $3) and $2::int > 0`;
    const mails = `from app.email_outbox where template in ('security_alert', 'security_digest') and created_at < $1::timestamptz - make_interval(days => $2)
        and $3::int > 0 and not exists (select 1 from app.security_alerts a where a.notified_outbox_id = app.email_outbox.id)`;
    const args = [now, s.routine_retention_days, s.incident_retention_days];
    if (!s.retention_enabled) {
      const c = await q.one<{ events: number; alerts: number; emails: number }>(
        `select (select count(*) ${events})::int as events, (select count(*) ${alerts})::int as alerts, (select count(*) ${mails})::int as emails`,
        args,
      );
      return { enabled: false, ...c! };
    }
    // Alerts first, so their events become eligible in the same run only if no other alert holds them.
    const al = await q.query(`delete ${alerts} returning 1`, args);
    const ev = await q.query(`delete from app.security_events where id in (select e.id ${events}) returning 1`, args);
    const em = await q.query(`delete ${mails} returning 1`, args);
    return { enabled: true, events: ev.length, alerts: al.length, emails: em.length };
  });
}
