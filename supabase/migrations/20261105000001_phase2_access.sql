-- =====================================================================
-- MOONUKE · Phase 2 · Invitation-only access, discovery, profiles
-- Plain PostgreSQL 15+ (Supabase compatible). Everything lives in `app`.
-- Defence in depth: the application connects as the schema owner for a
-- narrow set of "system" operations (sessions, invitation redemption,
-- rate limits) and runs every viewer-scoped query as role `mk_app`, which
-- is subject to the row-level security policies below.
-- =====================================================================

create extension if not exists citext;

create schema if not exists app;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'mk_app') then
    create role mk_app nologin noinherit;
  end if;
end $$;
grant mk_app to current_user;
grant usage on schema app to mk_app;

-- ---------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------
create type app.user_role as enum ('owner', 'creator', 'member');
create type app.user_status as enum ('pending', 'active', 'suspended', 'rejected');
create type app.application_status as enum ('pending', 'approved', 'rejected');
create type app.referral_status as enum ('pending', 'approved', 'declined');
create type app.creator_visibility as enum ('listed', 'discreet', 'private');
create type app.tier_kind as enum ('member', 'vip');
create type app.post_access as enum ('preview', 'members', 'vip', 'ppv');
create type app.subscription_status as enum ('active', 'canceled', 'expired');

-- ---------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------
create table app.users (
  id               uuid primary key default gen_random_uuid(),
  email            citext not null unique check (char_length(email::text) between 3 and 254),
  password_hash    text not null,
  role             app.user_role not null,
  status           app.user_status not null default 'pending',
  alias            citext not null unique check (alias::text ~ '^[[:alnum:]][[:alnum:] ._''-]{1,30}[[:alnum:]]$'),
  adult_attested_at timestamptz not null,
  invitation_id    uuid,
  approved_at      timestamptz,
  approved_by      uuid references app.users(id),
  suspended_at     timestamptz,
  suspended_reason text check (char_length(suspended_reason) <= 500),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
-- Exactly one platform owner, ever.
create unique index users_single_owner on app.users ((true)) where role = 'owner';

create table app.invitations (
  id                  uuid primary key default gen_random_uuid(),
  token_hash          bytea not null unique check (octet_length(token_hash) = 32),
  intended_role       app.user_role not null check (intended_role <> 'owner'),
  email               citext,
  max_uses            int not null default 1 check (max_uses between 1 and 100),
  use_count           int not null default 0,
  expires_at          timestamptz not null,
  revoked_at          timestamptz,
  revoked_by          uuid references app.users(id),
  note                text check (char_length(note) <= 500),
  created_by          uuid not null references app.users(id),
  referral_request_id uuid,
  created_at          timestamptz not null default now(),
  check (use_count >= 0 and use_count <= max_uses)
);
alter table app.users
  add constraint users_invitation_fk foreign key (invitation_id) references app.invitations(id);

create table app.applications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references app.users(id) on delete cascade,
  invitation_id uuid not null references app.invitations(id),
  status        app.application_status not null default 'pending',
  submitted_at  timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid references app.users(id),
  decision_note text check (char_length(decision_note) <= 500)
);

create table app.referral_requests (
  id             uuid primary key default gen_random_uuid(),
  requester_id   uuid not null references app.users(id) on delete cascade,
  invitee_name   text not null check (char_length(invitee_name) between 1 and 80),
  invitee_email  citext not null check (char_length(invitee_email::text) between 3 and 254),
  intended_role  app.user_role not null check (intended_role <> 'owner'),
  relationship   text not null check (char_length(relationship) between 1 and 500),
  status         app.referral_status not null default 'pending',
  invitation_id  uuid references app.invitations(id),
  decided_at     timestamptz,
  decided_by     uuid references app.users(id),
  decision_note  text check (char_length(decision_note) <= 500),
  created_at     timestamptz not null default now()
);
create unique index referral_one_pending
  on app.referral_requests (requester_id, invitee_email) where status = 'pending';
alter table app.invitations
  add constraint invitations_referral_fk foreign key (referral_request_id) references app.referral_requests(id);

create table app.sessions (
  id_hash      bytea primary key check (octet_length(id_hash) = 32),
  user_id      uuid not null references app.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at   timestamptz,
  user_agent   text check (char_length(user_agent) <= 300)
);
create index sessions_user on app.sessions (user_id) where revoked_at is null;

create table app.rate_limits (
  bucket       text not null,
  window_start timestamptz not null,
  count        int not null default 0,
  primary key (bucket, window_start)
);

create table app.audit_log (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  actor_id    uuid references app.users(id),
  action      text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  target_type text,
  target_id   text,
  ip_hash     text,
  metadata    jsonb not null default '{}'::jsonb
);
create index audit_log_at on app.audit_log (at desc);

create function app.audit_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only';
end $$;
create trigger audit_log_no_update before update or delete on app.audit_log
  for each row execute function app.audit_immutable();
create trigger audit_log_no_truncate before truncate on app.audit_log
  for each statement execute function app.audit_immutable();

-- ---------------------------------------------------------------------
-- Creators & content
-- ---------------------------------------------------------------------
create table app.categories (
  slug  text primary key check (slug ~ '^[a-z-]{2,32}$'),
  label text not null,
  sort  int not null default 0
);

create table app.creators (
  user_id      uuid primary key references app.users(id) on delete cascade,
  handle       citext not null unique check (handle::text ~ '^[a-z0-9_]{2,24}$'),
  display_name text not null check (char_length(display_name) between 1 and 60),
  discipline   text not null check (char_length(discipline) <= 60),
  category     text not null references app.categories(slug),
  city         text check (char_length(city) <= 60),
  tagline      text check (char_length(tagline) <= 160),
  bio          text check (char_length(bio) <= 2000),
  visibility   app.creator_visibility not null default 'listed',
  featured     boolean not null default false,
  cover        jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index creators_category on app.creators (category);

create table app.tiers (
  id             uuid primary key default gen_random_uuid(),
  creator_id     uuid not null references app.creators(user_id) on delete cascade,
  kind           app.tier_kind not null,
  name           text not null check (char_length(name) between 1 and 40),
  price_cents    int not null check (price_cents between 0 and 1000000),
  currency       char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  billing_period text not null default 'month' check (billing_period in ('month')),
  seat_limit     int check (seat_limit is null or seat_limit > 0),
  perks          text[] not null default '{}',
  active         boolean not null default true,
  sort           int not null default 0,
  unique (creator_id, kind, name)
);

create table app.posts (
  id           uuid primary key default gen_random_uuid(),
  creator_id   uuid not null references app.creators(user_id) on delete cascade,
  access       app.post_access not null,
  price_cents  int check (price_cents is null or price_cents between 50 and 1000000),
  currency     char(3) not null default 'USD',
  teaser       text not null check (char_length(teaser) <= 140),
  media_kind   text not null default 'image' check (media_kind in ('image', 'set', 'video')),
  media_count  int not null default 1 check (media_count between 1 and 100),
  published_at timestamptz not null default now(),
  check ((access = 'ppv') = (price_cents is not null))
);
create index posts_creator on app.posts (creator_id, published_at desc);

-- The gated half of a post. Never readable without entitlement.
create table app.post_content (
  post_id uuid primary key references app.posts(id) on delete cascade,
  body    text check (char_length(body) <= 5000),
  media   jsonb not null default '[]'::jsonb
);

create table app.subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  fan_id             uuid not null references app.users(id) on delete cascade,
  creator_id         uuid not null references app.creators(user_id) on delete cascade,
  tier_id            uuid not null references app.tiers(id),
  status             app.subscription_status not null default 'active',
  current_period_end timestamptz not null,
  created_at         timestamptz not null default now()
);
create unique index subscriptions_one_active
  on app.subscriptions (fan_id, creator_id) where status = 'active';

create table app.purchases (
  id         uuid primary key default gen_random_uuid(),
  fan_id     uuid not null references app.users(id) on delete cascade,
  post_id    uuid not null references app.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (fan_id, post_id)
);

create table app.follows (
  fan_id     uuid not null references app.users(id) on delete cascade,
  creator_id uuid not null references app.creators(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (fan_id, creator_id)
);

-- ---------------------------------------------------------------------
-- RLS helpers. SECURITY DEFINER so policy checks do not recurse into RLS.
-- The viewer id is bound per transaction:  set_config('app.user_id', $1, true)
-- ---------------------------------------------------------------------
create function app.uid() returns uuid language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create function app.viewer_role() returns app.user_role
language sql stable security definer set search_path = app, pg_temp as $$
  select role from app.users where id = app.uid() and status = 'active'
$$;

create function app.is_active() returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select exists (select 1 from app.users where id = app.uid() and status = 'active')
$$;

create function app.is_owner() returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select exists (select 1 from app.users where id = app.uid() and status = 'active' and role = 'owner')
$$;

create function app.has_active_sub(p_creator uuid, p_vip boolean) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select exists (
    select 1 from app.subscriptions s join app.tiers t on t.id = s.tier_id
    where s.fan_id = app.uid() and s.creator_id = p_creator
      and s.status = 'active' and s.current_period_end > now()
      and (not p_vip or t.kind = 'vip')
  )
$$;

create function app.can_see_creator(p_creator uuid) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select app.is_owner()
      or (p_creator = app.uid() and app.is_active())
      or (
        app.is_active() and exists (
          select 1 from app.creators c join app.users u on u.id = c.user_id
          where c.user_id = p_creator and u.status = 'active'
            and (c.visibility in ('listed', 'discreet') or app.has_active_sub(p_creator, false))
        )
      )
$$;

create function app.can_view_post(p_post uuid) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select coalesce((
    select case
      when app.is_owner() then true
      when p.creator_id = app.uid() and app.is_active() then true
      when not app.can_see_creator(p.creator_id) then false
      when p.access = 'preview' then true
      when p.access = 'members' then app.has_active_sub(p.creator_id, false)
      when p.access = 'vip' then app.has_active_sub(p.creator_id, true)
      when p.access = 'ppv' then exists (select 1 from app.purchases x where x.post_id = p.id and x.fan_id = app.uid())
      else false
    end
    from app.posts p where p.id = p_post
  ), false)
$$;

revoke all on function app.viewer_role(), app.is_active(), app.is_owner(),
  app.has_active_sub(uuid, boolean), app.can_see_creator(uuid), app.can_view_post(uuid) from public;
grant execute on function app.uid(), app.viewer_role(), app.is_active(), app.is_owner(),
  app.has_active_sub(uuid, boolean), app.can_see_creator(uuid), app.can_view_post(uuid) to mk_app;

-- ---------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------
alter table app.users             enable row level security;
alter table app.invitations       enable row level security;
alter table app.applications      enable row level security;
alter table app.referral_requests enable row level security;
alter table app.sessions          enable row level security;
alter table app.rate_limits       enable row level security;
alter table app.audit_log         enable row level security;
alter table app.categories        enable row level security;
alter table app.creators          enable row level security;
alter table app.tiers             enable row level security;
alter table app.posts             enable row level security;
alter table app.post_content      enable row level security;
alter table app.subscriptions     enable row level security;
alter table app.purchases         enable row level security;
alter table app.follows           enable row level security;
-- sessions and rate_limits: no grants and no policies → unreachable for mk_app.

-- users: self or owner can read (never password_hash); only owner changes status.
grant select (id, email, role, status, alias, adult_attested_at, invitation_id, approved_at, approved_by,
              suspended_at, suspended_reason, created_at, updated_at) on app.users to mk_app;
grant update (status, approved_at, approved_by, suspended_at, suspended_reason, updated_at) on app.users to mk_app;
create policy users_select on app.users for select to mk_app
  using (id = app.uid() or app.is_owner());
create policy users_owner_update on app.users for update to mk_app
  using (app.is_owner() and id <> app.uid() and role <> 'owner')
  with check (app.is_owner() and id <> app.uid() and role <> 'owner');

-- invitations: owner only.
grant select, insert, update (revoked_at, revoked_by) on app.invitations to mk_app;
create policy invitations_owner_select on app.invitations for select to mk_app using (app.is_owner());
create policy invitations_owner_insert on app.invitations for insert to mk_app
  with check (app.is_owner() and created_by = app.uid());
create policy invitations_owner_update on app.invitations for update to mk_app
  using (app.is_owner()) with check (app.is_owner());

-- applications: applicant reads own; owner reads & decides.
grant select, update (status, decided_at, decided_by, decision_note) on app.applications to mk_app;
create policy applications_select on app.applications for select to mk_app
  using (user_id = app.uid() or app.is_owner());
create policy applications_owner_update on app.applications for update to mk_app
  using (app.is_owner()) with check (app.is_owner() and decided_by = app.uid());

-- referral requests: active members/creators file their own; owner decides.
grant select, insert, update (status, invitation_id, decided_at, decided_by, decision_note) on app.referral_requests to mk_app;
create policy referrals_select on app.referral_requests for select to mk_app
  using (requester_id = app.uid() or app.is_owner());
create policy referrals_insert on app.referral_requests for insert to mk_app
  with check (requester_id = app.uid() and app.viewer_role() in ('member', 'creator') and status = 'pending'
              and invitation_id is null and decided_by is null);
create policy referrals_owner_update on app.referral_requests for update to mk_app
  using (app.is_owner()) with check (app.is_owner());

-- audit log: anyone in a viewer context may append as themselves; owner reads.
grant select, insert on app.audit_log to mk_app;
grant usage on sequence app.audit_log_id_seq to mk_app;
create policy audit_insert on app.audit_log for insert to mk_app with check (actor_id = app.uid());
create policy audit_owner_select on app.audit_log for select to mk_app using (app.is_owner());

-- catalogue
grant select on app.categories to mk_app;
create policy categories_select on app.categories for select to mk_app using (app.is_active());

grant select on app.creators to mk_app;
create policy creators_select on app.creators for select to mk_app using (app.can_see_creator(user_id));

grant select on app.tiers to mk_app;
create policy tiers_select on app.tiers for select to mk_app
  using (app.can_see_creator(creator_id) and (active or creator_id = app.uid() or app.is_owner()));

grant select on app.posts to mk_app;
create policy posts_select on app.posts for select to mk_app using (app.can_see_creator(creator_id));

grant select on app.post_content to mk_app;
create policy post_content_select on app.post_content for select to mk_app using (app.can_view_post(post_id));

-- entitlements: readable by the holder, the creator, the owner. Never writable by mk_app.
grant select on app.subscriptions, app.purchases to mk_app;
create policy subscriptions_select on app.subscriptions for select to mk_app
  using (fan_id = app.uid() or creator_id = app.uid() or app.is_owner());
create policy purchases_select on app.purchases for select to mk_app
  using (fan_id = app.uid() or app.is_owner());

grant select, insert, delete on app.follows to mk_app;
create policy follows_select on app.follows for select to mk_app
  using (fan_id = app.uid() or creator_id = app.uid() or app.is_owner());
create policy follows_insert on app.follows for insert to mk_app
  with check (fan_id = app.uid() and app.is_active() and app.can_see_creator(creator_id) and creator_id <> app.uid());
create policy follows_delete on app.follows for delete to mk_app using (fan_id = app.uid());

-- ---------------------------------------------------------------------
-- Aggregate helpers. Return counts only (never identities), and only for
-- creators the viewer is allowed to see.
-- ---------------------------------------------------------------------
create function app.creator_stats(p_creator uuid, out members int, out followers int)
language sql stable security definer set search_path = app, pg_temp as $$
  select
    case when app.can_see_creator(p_creator) then
      (select count(*)::int from app.subscriptions s
        where s.creator_id = p_creator and s.status = 'active' and s.current_period_end > now()) end,
    case when app.can_see_creator(p_creator) then
      (select count(*)::int from app.follows f where f.creator_id = p_creator) end
$$;

create function app.tier_seats_taken(p_tier uuid) returns int
language sql stable security definer set search_path = app, pg_temp as $$
  select case when app.can_see_creator(t.creator_id) then
    (select count(*)::int from app.subscriptions s
      where s.tier_id = t.id and s.status = 'active' and s.current_period_end > now()) end
  from app.tiers t where t.id = p_tier
$$;

revoke all on function app.creator_stats(uuid), app.tier_seats_taken(uuid) from public;
grant execute on function app.creator_stats(uuid), app.tier_seats_taken(uuid) to mk_app;
