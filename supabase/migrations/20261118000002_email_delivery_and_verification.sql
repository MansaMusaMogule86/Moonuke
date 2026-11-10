-- =====================================================================
-- DivaFans · Email delivery (Resend) and email verification
-- - Security severities become low / medium / high / critical.
-- - New alert type for security-sensitive administrative actions.
-- - The outbox records the provider's message id.
-- - Accounts record when their email address was confirmed (informational;
--   it does not change the invitation-and-approval rules).
-- =====================================================================

alter table app.security_events drop constraint security_events_severity_check;
alter table app.security_alerts drop constraint security_alerts_severity_check;
update app.security_events set severity = case severity when 'info' then 'low' when 'warning' then 'medium' else severity end;
update app.security_alerts set severity = case severity when 'info' then 'low' when 'warning' then 'medium' else severity end;
alter table app.security_events alter column severity set default 'low',
  add constraint security_events_severity_check check (severity in ('low', 'medium', 'high', 'critical'));
alter table app.security_alerts
  add constraint security_alerts_severity_check check (severity in ('low', 'medium', 'high', 'critical'));

alter table app.security_alerts drop constraint security_alerts_alert_type_check;
alter table app.security_alerts add constraint security_alerts_alert_type_check check (alert_type in (
  'failed_logins_account', 'failed_logins_ip', 'credential_stuffing', 'distributed_failures',
  'blocked_account_attempt', 'mfa_failures', 'new_country', 'new_admin_device', 'monitoring_failure', 'admin_action'));

alter table app.email_outbox add column provider_message_id text check (char_length(provider_message_id) <= 120);

alter table app.users add column email_verified_at timestamptz;
grant select (email_verified_at) on app.users to mk_app;
