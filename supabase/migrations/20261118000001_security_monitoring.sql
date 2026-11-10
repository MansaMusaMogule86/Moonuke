-- =====================================================================
-- DivaFans · Security monitoring
-- Server-side security events, alerts and settings, plus reliable email
-- delivery (backoff + idempotency) for the existing outbox.
--
-- Privacy: no raw IPs, emails, tokens or user agents are stored here.
-- Events carry the keyed IP hash already used by rate limiting, a network
-- prefix (/24 IPv4, /48 IPv6), the proxy-reported country/region, and
-- coarse device/browser/OS families. Failed attempts against unknown
-- accounts are correlated by a keyed hash of the submitted email.
--
-- Access: owner only (app.is_owner() requires an AAL2 session). Writes come
-- from system() at trusted server-side call sites; mk_app can never insert,
-- delete or rewrite events.
-- =====================================================================

create table app.security_events (
  id              bigserial primary key,
  event_type      text not null check (event_type in (
                    'auth.login.success', 'auth.login.failed', 'auth.login.blocked', 'auth.mfa.failed',
                    'auth.registration.completed', 'creator.application.submitted')),
  severity        text not null default 'info' check (severity in ('info', 'warning', 'high', 'critical')),
  actor_user_id   uuid references app.users(id) on delete set null,
  account_ref     text check (account_ref ~ '^[a-f0-9]{64}$'),
  ip_hash         text check (char_length(ip_hash) <= 128),
  ip_prefix       cidr,
  ip_country      text check (ip_country ~ '^[A-Z]{2}$'),
  ip_region       text check (ip_region ~ '^[A-Za-z0-9-]{1,10}$'),
  device_category text check (device_category in ('desktop', 'mobile', 'tablet', 'bot', 'unknown')),
  browser_family  text check (char_length(browser_family) <= 24),
  os_family       text check (char_length(os_family) <= 24),
  device_key      text check (device_key ~ '^[a-f0-9]{64}$'),
  new_device      boolean,
  session_ref     uuid,
  correlation_id  uuid not null,
  dedupe_key      text unique check (char_length(dedupe_key) <= 120),
  -- Allowlisted per event type in application code; bounded here as a backstop.
  metadata        jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 1024),
  retention_class text not null default 'routine' check (retention_class in ('routine', 'incident')),
  occurred_at     timestamptz not null default now()
);
create index security_events_at on app.security_events (occurred_at desc);
create index security_events_type_at on app.security_events (event_type, occurred_at desc);
create index security_events_actor_at on app.security_events (actor_user_id, occurred_at desc) where actor_user_id is not null;
create index security_events_account_at on app.security_events (account_ref, occurred_at desc) where account_ref is not null;
create index security_events_ip_at on app.security_events (ip_hash, occurred_at desc) where ip_hash is not null;
create index security_events_device on app.security_events (actor_user_id, device_key) where event_type = 'auth.login.success';

create table app.security_alerts (
  id               uuid primary key default gen_random_uuid(),
  alert_type       text not null check (alert_type in (
                     'failed_logins_account', 'failed_logins_ip', 'credential_stuffing', 'distributed_failures',
                     'blocked_account_attempt', 'mfa_failures', 'new_country', 'new_admin_device', 'monitoring_failure')),
  severity         text not null check (severity in ('info', 'warning', 'high', 'critical')),
  status           text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  summary          text not null check (char_length(summary) <= 300),
  source_event_id  bigint references app.security_events(id) on delete set null,
  subject_user_id  uuid references app.users(id) on delete set null,
  dedupe_key       text not null check (char_length(dedupe_key) <= 160),
  dedupe_bucket    bigint not null,
  note             text check (char_length(note) <= 1000),
  notified_outbox_id uuid references app.email_outbox(id) on delete set null,
  created_at       timestamptz not null default now(),
  acknowledged_at  timestamptz,
  acknowledged_by  uuid references app.users(id),
  resolved_at      timestamptz,
  resolved_by      uuid references app.users(id),
  -- One alert per signal per cooldown window.
  unique (dedupe_key, dedupe_bucket)
);
create index security_alerts_status_at on app.security_alerts (status, created_at desc);

create table app.monitoring_settings (
  id                          boolean primary key default true check (id),
  failed_account_threshold    int not null default 5 check (failed_account_threshold between 2 and 100),
  failed_ip_threshold         int not null default 20 check (failed_ip_threshold between 2 and 1000),
  stuffing_accounts_threshold int not null default 10 check (stuffing_accounts_threshold between 2 and 1000),
  distributed_threshold       int not null default 100 check (distributed_threshold between 10 and 100000),
  mfa_failure_threshold       int not null default 5 check (mfa_failure_threshold between 2 and 100),
  window_minutes              int not null default 15 check (window_minutes between 1 and 1440),
  alert_cooldown_minutes      int not null default 60 check (alert_cooldown_minutes between 1 and 1440),
  max_alert_emails_per_hour   int not null default 20 check (max_alert_emails_per_hour between 1 and 500),
  immediate_registration      boolean not null default false,
  immediate_creator_application boolean not null default false,
  digest_local_time           time not null default '08:00',
  digest_timezone             text not null default 'Asia/Dubai' check (char_length(digest_timezone) <= 64),
  -- Retention stays OFF until the periods are approved (docs/PRIVACY_AND_RETENTION_REVIEW.md).
  retention_enabled           boolean not null default false,
  routine_retention_days      int not null default 30 check (routine_retention_days between 1 and 3650),
  incident_retention_days     int not null default 90 check (incident_retention_days between 1 and 3650),
  updated_at                  timestamptz not null default now(),
  updated_by                  uuid references app.users(id)
);
insert into app.monitoring_settings default values;

-- Reliable outbox delivery: exponential backoff and idempotent enqueue.
alter table app.email_outbox
  add column next_attempt_at timestamptz,
  add column dedupe_key text unique check (char_length(dedupe_key) <= 160);
create index email_outbox_due on app.email_outbox (created_at) where status = 'queued';

-- ---------------------------------------------------------------- RLS
alter table app.security_events enable row level security;
alter table app.security_alerts enable row level security;
alter table app.monitoring_settings enable row level security;

revoke all on app.security_events, app.security_alerts, app.monitoring_settings from public;
revoke all on sequence app.security_events_id_seq from public;

grant select on app.security_events to mk_app;
grant select, update (status, note, acknowledged_at, acknowledged_by, resolved_at, resolved_by) on app.security_alerts to mk_app;
grant select, update (failed_account_threshold, failed_ip_threshold, stuffing_accounts_threshold, distributed_threshold,
                      mfa_failure_threshold, window_minutes, alert_cooldown_minutes, max_alert_emails_per_hour,
                      immediate_registration, immediate_creator_application, digest_local_time, updated_at, updated_by)
  on app.monitoring_settings to mk_app;

create policy security_events_owner_read on app.security_events for select to mk_app using (app.is_owner());
create policy security_alerts_owner_read on app.security_alerts for select to mk_app using (app.is_owner());
create policy security_alerts_owner_update on app.security_alerts for update to mk_app using (app.is_owner()) with check (app.is_owner());
create policy monitoring_settings_owner_read on app.monitoring_settings for select to mk_app using (app.is_owner());
create policy monitoring_settings_owner_update on app.monitoring_settings for update to mk_app using (app.is_owner()) with check (app.is_owner());
