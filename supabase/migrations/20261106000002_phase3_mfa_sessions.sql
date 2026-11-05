-- =====================================================================
-- Phase 3 · Multi-factor authentication and session management
-- =====================================================================

-- Sessions gain a public handle (for listing/revoking without exposing the
-- token hash) and the time the second factor was verified in this session.
alter table app.sessions
  add column public_id uuid not null default gen_random_uuid() unique,
  add column mfa_verified_at timestamptz;

-- One TOTP authenticator per user. The secret is encrypted at rest
-- (AES-256-GCM, key derived from APP_SECRET). last_used_step blocks replay.
create table app.mfa_factors (
  user_id        uuid primary key references app.users(id) on delete cascade,
  secret_enc     text not null,
  created_at     timestamptz not null default now(),
  confirmed_at   timestamptz,
  last_used_step bigint
);

-- Single-use recovery codes, hashed.
create table app.mfa_recovery_codes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references app.users(id) on delete cascade,
  code_hash  bytea not null check (octet_length(code_hash) = 32),
  created_at timestamptz not null default now(),
  used_at    timestamptz,
  unique (user_id, code_hash)
);

alter table app.mfa_factors enable row level security;
alter table app.mfa_recovery_codes enable row level security;
-- No grants: MFA material is reachable only by the system role.

-- ---------------------------------------------------------------------
-- Owner authority now requires a second factor verified in THIS session.
-- The app binds app.aal per transaction ('2' only after TOTP verification),
-- so an owner session that skipped MFA has no owner powers at the DB layer.
-- ---------------------------------------------------------------------
create or replace function app.is_owner() returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select coalesce(current_setting('app.aal', true), '1') = '2'
     and exists (select 1 from app.users where id = app.uid() and status = 'active' and role = 'owner')
$$;
