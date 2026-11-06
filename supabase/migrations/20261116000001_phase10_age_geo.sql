-- =====================================================================
-- Phase 10 · Age assurance and regional rules (INACTIVE)
-- Both are switched off by server flags (FEATURE_AGE_ASSURANCE,
-- FEATURE_GEO_RESTRICTIONS), which production refuses until approved.
-- Rules can be prepared while off; they have no effect until then.
-- No jurisdiction is pre-filled: that is a legal decision (L-1).
-- =====================================================================

-- One rule per country (ISO 3166-1 alpha-2). 'XX' = country unknown.
create table app.jurisdiction_rules (
  country     char(2) primary key check (country ~ '^[A-Z]{2}$'),
  rule        text not null check (rule in ('block', 'age_assurance')),
  note        text check (char_length(note) <= 300),
  updated_by  uuid not null references app.users(id),
  updated_at  timestamptz not null default now()
);
alter table app.jurisdiction_rules enable row level security;
grant select, insert, update (rule, note, updated_by, updated_at), delete on app.jurisdiction_rules to mk_app;
create policy jurisdiction_owner on app.jurisdiction_rules for all to mk_app
  using (app.is_owner()) with check (app.is_owner() and updated_by = app.uid());

-- Where age assurance applies when the feature is on: only countries with an
-- 'age_assurance' rule ('listed'), or everyone ('everywhere').
alter table app.safety_settings
  add column age_assurance_scope text not null default 'listed' check (age_assurance_scope in ('listed', 'everywhere'));

create function app.set_age_assurance_scope(p_scope text) returns void
language plpgsql security definer set search_path = app, pg_temp as $$
begin
  if not app.is_owner() then raise exception 'not allowed' using errcode = '42501'; end if;
  update app.safety_settings set age_assurance_scope = p_scope, updated_by = app.uid(), updated_at = now() where id;
  insert into app.audit_log (actor_id, action, target_type, metadata)
  values (app.uid(), 'access.age_scope', 'settings', jsonb_build_object('scope', p_scope));
end $$;
revoke all on function app.set_age_assurance_scope(text) from public;
grant execute on function app.set_age_assurance_scope(text) to mk_app;

create function app.age_assurance_scope() returns text
language sql stable security definer set search_path = app, pg_temp as $$
  select age_assurance_scope from app.safety_settings where id
$$;
revoke all on function app.age_assurance_scope() from public;
grant execute on function app.age_assurance_scope() to mk_app;

-- Age checks: the outcome only. No date of birth, no document, no image.
create table app.age_checks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references app.users(id) on delete cascade,
  provider      text not null check (provider ~ '^[a-z0-9_]{2,30}$'),
  provider_ref  text check (char_length(provider_ref) <= 200),
  status        text not null default 'pending' check (status in ('pending', 'passed', 'failed', 'expired')),
  method        text check (char_length(method) <= 60),
  assurance     text check (assurance in ('high', 'standard')),
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  expires_at    timestamptz,
  unique (provider, provider_ref),
  check ((status = 'pending') = (decided_at is null))
);
create index age_checks_user on app.age_checks (user_id, created_at desc);
alter table app.age_checks enable row level security;
-- Users see their own outcomes; every write comes from the server after it
-- has verified the provider's signed result.
grant select on app.age_checks to mk_app;
create policy age_checks_own on app.age_checks for select to mk_app using (user_id = app.uid() or app.is_owner());
