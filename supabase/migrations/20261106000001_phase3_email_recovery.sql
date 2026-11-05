-- =====================================================================
-- Phase 3 · Transactional email outbox and password recovery
-- =====================================================================

-- Outbox: messages are enqueued in the same transaction as the event that
-- caused them, then delivered asynchronously. Bodies (which can contain
-- one-time links) are scrubbed after a real delivery.
create table app.email_outbox (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references app.users(id) on delete set null,
  to_email    citext not null check (char_length(to_email::text) between 3 and 254),
  template    text not null check (template ~ '^[a-z_]{2,40}$'),
  subject     text not null check (char_length(subject) <= 200),
  body_text   text,
  body_html   text,
  status      text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'suppressed')),
  attempts    int not null default 0,
  last_error  text check (char_length(last_error) <= 500),
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);
create index email_outbox_queue on app.email_outbox (created_at) where status = 'queued';

-- Password reset tokens: only the SHA-256 is stored; single use; short-lived.
create table app.password_resets (
  token_hash  bytea primary key check (octet_length(token_hash) = 32),
  user_id     uuid not null references app.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz
);
create index password_resets_user on app.password_resets (user_id) where used_at is null;

alter table app.email_outbox enable row level security;
alter table app.password_resets enable row level security;

-- The owner may read delivery metadata (never bodies). Resets: no access at all.
grant select (id, user_id, to_email, template, subject, status, attempts, last_error, created_at, sent_at)
  on app.email_outbox to mk_app;
create policy email_outbox_owner_select on app.email_outbox for select to mk_app using (app.is_owner());

-- Viewer-scoped code may queue mail: the owner to anyone (invitations,
-- approvals); everyone else only to their own address (security notices).
grant insert (user_id, to_email, template, subject, body_text, body_html, status) on app.email_outbox to mk_app;
create policy email_outbox_insert on app.email_outbox for insert to mk_app
  with check (
    app.is_owner()
    or (user_id = app.uid() and to_email = (select u.email from app.users u where u.id = app.uid()))
  );
