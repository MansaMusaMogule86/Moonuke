-- =====================================================================
-- Phase 3 · Creator verification and approval
-- An approved creator ACCOUNT is not a visible PROFILE: the profile is
-- shown to members only after the owner verifies the creator and publishes.
-- No verification vendor is connected; the schema is vendor-ready but
-- stores no identity documents, legal names or dates of birth (data
-- minimisation — a vendor would hold those; we keep its reference/result).
-- =====================================================================

create type app.verification_status as enum ('not_started', 'submitted', 'in_review', 'needs_more_info', 'verified', 'rejected');

create table app.creator_verifications (
  user_id                      uuid primary key references app.users(id) on delete cascade,
  status                       app.verification_status not null default 'not_started',
  method                       text not null default 'manual' check (method in ('manual', 'vendor')),
  vendor                       text check (char_length(vendor) <= 60),
  vendor_ref                   text check (char_length(vendor_ref) <= 200),
  age_attested_at              timestamptz,
  identity_attested_at         timestamptz,
  consent_records_attested_at  timestamptz,
  terms_accepted_at            timestamptz,
  submitted_at                 timestamptz,
  -- Owner checklist, completed after out-of-band review (or a vendor result).
  checks                       jsonb not null default '{}'::jsonb,
  review_note                  text check (char_length(review_note) <= 1000),
  reviewed_by                  uuid references app.users(id),
  reviewed_at                  timestamptz,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

alter table app.creators add column published_at timestamptz;

-- Existing (Phase 2) creators were curated by the house: treat as verified + published.
insert into app.creator_verifications (user_id, status, method, checks, submitted_at, reviewed_at, review_note)
  select user_id, 'verified', 'manual', '{"identity":true,"age":true,"consent_records":true}', now(), now(), 'Migrated from Phase 2 curated creators'
    from app.creators on conflict do nothing;
update app.creators set published_at = coalesce(published_at, created_at);

-- Only the owner may publish or feature a profile.
-- SECURITY INVOKER on purpose: current_user must be the caller's role
-- (mk_app for viewer-scoped writes). A definer trigger would see its owner
-- and skip the check.
create function app.creators_guard() returns trigger language plpgsql set search_path = app, pg_temp as $$
begin
  if current_user <> 'mk_app' then return new; end if; -- system role (migrations, seed)
  if tg_op = 'INSERT' then
    if (new.published_at is not null or new.featured) and not app.is_owner() then
      raise exception 'only the owner can publish or feature a creator' using errcode = '42501';
    end if;
  elsif (new.published_at is distinct from old.published_at or new.featured is distinct from old.featured
         or new.user_id is distinct from old.user_id) and not app.is_owner() then
    raise exception 'only the owner can publish or feature a creator' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger creators_guard before insert or update on app.creators for each row execute function app.creators_guard();

-- Visibility now requires publication (owner and self are exempt).
create or replace function app.can_see_creator(p_creator uuid) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select app.is_owner()
      or (p_creator = app.uid() and app.is_active())
      or (
        app.is_active()
        and not app.is_blocked_between(app.uid(), p_creator)
        and exists (
          select 1 from app.creators c join app.users u on u.id = c.user_id
          where c.user_id = p_creator and u.status = 'active' and c.published_at is not null
            and (c.visibility in ('listed', 'discreet') or app.has_active_sub(p_creator, false))
        )
      )
$$;

alter table app.creator_verifications enable row level security;

-- Creators manage their own profile draft (not publication/featuring — see trigger).
grant insert (user_id, handle, display_name, discipline, category, city, tagline, bio, visibility, cover) on app.creators to mk_app;
grant update (handle, display_name, discipline, category, city, tagline, bio, visibility, cover, published_at, featured) on app.creators to mk_app;
create policy creators_self_insert on app.creators for insert to mk_app
  with check (user_id = app.uid() and app.viewer_role() = 'creator');
create policy creators_self_update on app.creators for update to mk_app
  using (user_id = app.uid() and app.viewer_role() = 'creator') with check (user_id = app.uid());
create policy creators_owner_update on app.creators for update to mk_app using (app.is_owner()) with check (app.is_owner());

-- Verification records: creator reads/submits own; owner reviews.
grant select on app.creator_verifications to mk_app;
grant insert (user_id, status, age_attested_at, identity_attested_at, consent_records_attested_at, terms_accepted_at, submitted_at) on app.creator_verifications to mk_app;
grant update (status, age_attested_at, identity_attested_at, consent_records_attested_at, terms_accepted_at, submitted_at, updated_at,
              checks, review_note, reviewed_by, reviewed_at) on app.creator_verifications to mk_app;
create policy cv_select on app.creator_verifications for select to mk_app using (user_id = app.uid() or app.is_owner());
create policy cv_self_insert on app.creator_verifications for insert to mk_app
  with check (user_id = app.uid() and app.viewer_role() = 'creator' and status in ('not_started', 'submitted'));
-- A creator may only move their own record INTO 'submitted', and only from a resubmittable state.
create policy cv_self_submit on app.creator_verifications for update to mk_app
  using (user_id = app.uid() and status in ('not_started', 'needs_more_info', 'rejected'))
  with check (user_id = app.uid() and status = 'submitted' and checks = '{}'::jsonb and reviewed_by is null);
create policy cv_owner_review on app.creator_verifications for update to mk_app using (app.is_owner()) with check (app.is_owner());
