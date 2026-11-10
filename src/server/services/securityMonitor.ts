import "server-only";
import { can, type Viewer } from "@/server/auth/permissions";
import { asViewer } from "@/server/db";
import { AppError } from "@/server/errors";
import { accountRef, type Settings } from "@/server/security/monitor";
import { audit } from "./audit";

/**
 * Owner security console. Every query runs as the viewer under RLS
 * (security tables are readable only by an owner with an AAL2 session);
 * the permission check here is the second layer. Viewing an event's detail
 * and every change is written to the audit log.
 */
const gate = (v: Viewer) => {
  if (!can(v, "security.view")) throw new AppError("forbidden", "Not available.");
};

export const EVENT_TYPES = [
  "auth.login.success", "auth.login.failed", "auth.login.blocked", "auth.mfa.failed", "auth.registration.completed", "creator.application.submitted",
] as const;
export const SEVERITIES = ["info", "warning", "high", "critical"] as const;
export const PAGE_SIZE = 25;

export type EventRow = {
  id: string;
  event_type: string;
  severity: string;
  occurred_at: Date;
  alias: string | null;
  ip_prefix: string | null;
  ip_country: string | null;
  ip_region: string | null;
  device_category: string | null;
  browser_family: string | null;
  os_family: string | null;
  new_device: boolean | null;
};
export type AlertRow = {
  id: string;
  alert_type: string;
  severity: string;
  status: string;
  summary: string;
  note: string | null;
  created_at: Date;
  source_event_id: string | null;
  notified: boolean;
};

const EVENT_COLS = `e.id::text, e.event_type, e.severity, e.occurred_at, u.alias::text as alias, host(e.ip_prefix) || '/' || masklen(e.ip_prefix) as ip_prefix,
  e.ip_country, e.ip_region, e.device_category, e.browser_family, e.os_family, e.new_device`;

export async function securityOverview(v: Viewer) {
  gate(v);
  return asViewer(v, async (q) => {
    const totals = await q.one<{ logins: number; registrations: number; failed: number; open: number; critical: number }>(
      `select (select count(*) from app.security_events where event_type = 'auth.login.success' and occurred_at > now() - interval '24 hours')::int as logins,
              (select count(*) from app.security_events where event_type = 'auth.registration.completed' and occurred_at > now() - interval '24 hours')::int as registrations,
              (select count(*) from app.security_events where event_type in ('auth.login.failed', 'auth.login.blocked', 'auth.mfa.failed') and occurred_at > now() - interval '24 hours')::int as failed,
              (select count(*) from app.security_alerts where status <> 'resolved')::int as open,
              (select count(*) from app.security_alerts where status <> 'resolved' and severity = 'critical')::int as critical`,
    );
    const pendingCreators = await q.one<{ n: number }>(
      `select count(*)::int as n from app.applications a join app.users u on u.id = a.user_id where a.status = 'pending' and u.role = 'creator'`,
    );
    const countries = await q.query<{ country: string; n: number }>(
      `select ip_country as country, count(*)::int as n from app.security_events
        where event_type = 'auth.login.success' and ip_country is not null and occurred_at > now() - interval '24 hours'
        group by 1 order by 2 desc, 1 limit 8`,
    );
    const delivery = await q.query<{ status: string; n: number }>(
      `select status, count(*)::int as n from app.email_outbox
        where template in ('security_alert', 'security_digest') and created_at > now() - interval '7 days' group by 1 order by 1`,
    );
    const recent = await q.query<EventRow>(
      `select ${EVENT_COLS} from app.security_events e left join app.users u on u.id = e.actor_user_id order by e.occurred_at desc, e.id desc limit 10`,
    );
    return { totals: { ...totals!, pendingCreators: pendingCreators?.n ?? 0 }, countries, delivery, recent };
  });
}

export async function listAlerts(v: Viewer, status: "active" | "resolved" = "active"): Promise<AlertRow[]> {
  gate(v);
  return asViewer(v, (q) =>
    q.query<AlertRow>(
      `select id, alert_type, severity, status, summary, note, created_at, source_event_id::text, notified_outbox_id is not null as notified
         from app.security_alerts where ${status === "active" ? "status <> 'resolved'" : "status = 'resolved'"}
        order by case severity when 'critical' then 0 when 'high' then 1 when 'warning' then 2 else 3 end, created_at desc limit 50`,
    ),
  );
}

export type EventFilters = { type?: string; severity?: string; country?: string; from?: string; to?: string; account?: string; page: number };

/** Server-side filtering and pagination; nothing unbounded reaches the browser. */
export async function listEvents(v: Viewer, f: EventFilters): Promise<{ rows: EventRow[]; total: number }> {
  gate(v);
  return asViewer(v, async (q) => {
    const where: string[] = [];
    const args: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      args.push(value);
      where.push(sql.replace("?", `$${args.length}`));
    };
    if (f.type) add("e.event_type = ?", f.type);
    if (f.severity) add("e.severity = ?", f.severity);
    if (f.country) add("e.ip_country = ?", f.country);
    if (f.from) add("e.occurred_at >= ?::date", f.from);
    if (f.to) add("e.occurred_at < ?::date + 1", f.to);
    if (f.account) {
      // By account email: the account's own events plus attempts made with that address (matched by keyed hash).
      const user = await q.one<{ id: string }>(`select id from app.users where email = $1`, [f.account]);
      args.push(user?.id ?? null, accountRef(f.account));
      where.push(`(e.actor_user_id = $${args.length - 1} or e.account_ref = $${args.length})`);
      await audit(q, { actorId: v.id, action: "security.account_search", metadata: { matched: !!user } });
    }
    const w = where.length ? `where ${where.join(" and ")}` : "";
    const total = await q.one<{ n: number }>(`select count(*)::int as n from app.security_events e ${w}`, args);
    const rows = await q.query<EventRow>(
      `select ${EVENT_COLS} from app.security_events e left join app.users u on u.id = e.actor_user_id ${w}
        order by e.occurred_at desc, e.id desc limit ${PAGE_SIZE} offset ${PAGE_SIZE * Math.max(0, f.page - 1)}`,
      args,
    );
    return { rows, total: total?.n ?? 0 };
  });
}

export async function getEvent(v: Viewer, id: string) {
  gate(v);
  return asViewer(v, async (q) => {
    const e = await q.one<EventRow & { session_ref: string | null; correlation_id: string; metadata: Record<string, unknown>; account_matched: boolean }>(
      `select ${EVENT_COLS}, e.session_ref::text, e.correlation_id::text, e.metadata, e.account_ref is not null as account_matched
         from app.security_events e left join app.users u on u.id = e.actor_user_id where e.id = $1`,
      [id],
    );
    if (!e) return null;
    const related = await q.query<EventRow>(
      `select ${EVENT_COLS} from app.security_events e left join app.users u on u.id = e.actor_user_id
        where e.correlation_id = $1 and e.id <> $2 order by e.occurred_at limit 20`,
      [e.correlation_id, id],
    );
    const alerts = await q.query<{ id: string; alert_type: string; severity: string; status: string }>(
      `select id, alert_type, severity, status from app.security_alerts where source_event_id = $1`,
      [id],
    );
    await audit(q, { actorId: v.id, action: "security.event_view", targetType: "security_event", targetId: id });
    return { event: e, related, alerts };
  });
}

export async function updateAlert(v: Viewer, input: { id: string; action: "acknowledge" | "resolve" | "note"; note?: string }) {
  gate(v);
  return asViewer(v, async (q) => {
    const set =
      input.action === "acknowledge"
        ? `status = 'acknowledged', acknowledged_at = now(), acknowledged_by = $2`
        : input.action === "resolve"
          ? `status = 'resolved', resolved_at = now(), resolved_by = $2`
          : `status = case when status = 'open' then 'acknowledged' else status end, acknowledged_at = coalesce(acknowledged_at, now()), acknowledged_by = coalesce(acknowledged_by, $2)`; // a note counts as acknowledging
    const row = await q.one<{ id: string }>(
      `update app.security_alerts set ${set}, note = coalesce($3, note) where id = $1 ${input.action === "acknowledge" ? "and status = 'open'" : input.action === "resolve" ? "and status <> 'resolved'" : ""} returning id`,
      [input.id, v.id, input.note?.trim() || null],
    );
    if (!row) throw new AppError("conflict", "That alert has already moved on. Refresh to see its current state.");
    await audit(q, { actorId: v.id, action: `security.alert_${input.action}`, targetType: "security_alert", targetId: input.id });
  });
}

export async function getSettings(v: Viewer): Promise<Settings> {
  gate(v);
  return asViewer(v, (q) => q.one<Settings>(`select * from app.monitoring_settings where id`).then((s) => s!));
}

export type ThresholdInput = Pick<
  Settings,
  | "failed_account_threshold" | "failed_ip_threshold" | "stuffing_accounts_threshold" | "distributed_threshold" | "mfa_failure_threshold"
  | "window_minutes" | "alert_cooldown_minutes" | "max_alert_emails_per_hour" | "immediate_registration" | "immediate_creator_application" | "digest_local_time"
>;

export async function updateSettings(v: Viewer, s: ThresholdInput) {
  gate(v);
  await asViewer(v, async (q) => {
    await q.query(
      `update app.monitoring_settings set failed_account_threshold = $1, failed_ip_threshold = $2, stuffing_accounts_threshold = $3,
              distributed_threshold = $4, mfa_failure_threshold = $5, window_minutes = $6, alert_cooldown_minutes = $7,
              max_alert_emails_per_hour = $8, immediate_registration = $9, immediate_creator_application = $10, digest_local_time = $11,
              updated_at = now(), updated_by = $12 where id`,
      [
        s.failed_account_threshold, s.failed_ip_threshold, s.stuffing_accounts_threshold, s.distributed_threshold, s.mfa_failure_threshold,
        s.window_minutes, s.alert_cooldown_minutes, s.max_alert_emails_per_hour, s.immediate_registration, s.immediate_creator_application,
        s.digest_local_time, v.id,
      ],
    );
    await audit(q, { actorId: v.id, action: "security.settings_update", metadata: { ...s } });
  });
}
