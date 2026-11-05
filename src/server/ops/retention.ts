/**
 * Data-retention configuration. Every period is a LEGAL decision (open
 * question #5) and is deliberately null = "keep; do not delete". The
 * enforcement job (`retentionPlan`) only reports what WOULD be removed under
 * a candidate policy, so counsel can review the impact before anything is
 * enabled. Nothing here deletes data.
 */
export type RetentionPolicy = {
  messagesDays: number | null;
  removedMessagesDays: number | null;
  notificationsDays: number | null;
  auditLogDays: number | null; // likely "never" — audit is evidence
  quarantinedMediaDays: number | null;
  closedReportsDays: number | null;
  deletedAccountGraceDays: number | null;
};

export const RETENTION_POLICY: RetentionPolicy = {
  messagesDays: null,
  removedMessagesDays: null,
  notificationsDays: null,
  auditLogDays: null,
  quarantinedMediaDays: null,
  closedReportsDays: null,
  deletedAccountGraceDays: null,
};

export const RETENTION_TABLES = {
  messagesDays: `select count(*)::int as n from app.messages where status = 'sent' and created_at < now() - make_interval(days => $1)`,
  removedMessagesDays: `select count(*)::int as n from app.messages where status = 'removed' and created_at < now() - make_interval(days => $1)`,
  notificationsDays: `select count(*)::int as n from app.notifications where created_at < now() - make_interval(days => $1)`,
  auditLogDays: `select count(*)::int as n from app.audit_log where created_at < now() - make_interval(days => $1)`,
  quarantinedMediaDays: `select count(*)::int as n from app.media_uploads where status = 'quarantined' and updated_at < now() - make_interval(days => $1)`,
  closedReportsDays: `select count(*)::int as n from app.reports where status in ('actioned', 'dismissed') and created_at < now() - make_interval(days => $1)`,
  deletedAccountGraceDays: null,
} as const;
