-- =====================================================================
-- Phase 3 · Blocking, reporting, moderation and escalation
-- =====================================================================

create table app.blocks (
  blocker_id uuid not null references app.users(id) on delete cascade,
  blocked_id uuid not null references app.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked on app.blocks (blocked_id);

create type app.report_reason as enum (
  'harassment', 'impersonation', 'spam', 'copyright', 'other',
  'underage_concern', 'non_consensual', 'illegal_content'
);
create type app.report_status as enum ('open', 'in_review', 'actioned', 'dismissed', 'escalated');
create type app.report_target as enum ('creator', 'post', 'user');

create table app.reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references app.users(id) on delete cascade,
  target_type      app.report_target not null,
  target_id        uuid not null,
  target_user_id   uuid references app.users(id) on delete set null, -- account responsible for the target
  reason           app.report_reason not null,
  details          text check (char_length(details) <= 2000),
  -- 3 critical (child safety, non-consensual, illegal) · 2 high · 1 normal
  severity         smallint generated always as (
                     case when reason in ('underage_concern', 'non_consensual', 'illegal_content') then 3
                          when reason in ('harassment', 'impersonation') then 2
                          else 1 end) stored,
  status           app.report_status not null default 'open',
  resolution_note  text check (char_length(resolution_note) <= 1000),
  escalation_ref   text check (char_length(escalation_ref) <= 120),
  resolved_by      uuid references app.users(id),
  resolved_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index reports_queue on app.reports (severity desc, created_at) where status in ('open', 'in_review');
-- One open report per reporter per target (prevents report flooding).
create unique index reports_one_open on app.reports (reporter_id, target_type, target_id) where status in ('open', 'in_review');

create table app.moderation_actions (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid references app.reports(id) on delete set null,
  actor_id    uuid references app.users(id),
  action      text not null check (action in ('in_review', 'dismiss', 'hide_post', 'restore_post', 'suspend_user', 'escalate', 'resolve', 'auto_hide_post')),
  target_type text,
  target_id   uuid,
  note        text check (char_length(note) <= 1000),
  created_at  timestamptz not null default now()
);

alter table app.posts add column hidden_at timestamptz, add column hidden_reason text check (char_length(hidden_reason) <= 200);

alter table app.blocks enable row level security;
alter table app.reports enable row level security;
alter table app.moderation_actions enable row level security;

-- ---------------------------------------------------------------------
-- Visibility: a block in EITHER direction hides the creator (profile,
-- discovery, posts, post content, media) — except from the owner.
-- Hidden (moderated) posts are visible only to the owner and their creator.
-- ---------------------------------------------------------------------
create or replace function app.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select exists (select 1 from app.blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a))
$$;

create or replace function app.can_see_creator(p_creator uuid) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select app.is_owner()
      or (p_creator = app.uid() and app.is_active())
      or (
        app.is_active()
        and not app.is_blocked_between(app.uid(), p_creator)
        and exists (
          select 1 from app.creators c join app.users u on u.id = c.user_id
          where c.user_id = p_creator and u.status = 'active'
            and (c.visibility in ('listed', 'discreet') or app.has_active_sub(p_creator, false))
        )
      )
$$;

create or replace function app.can_view_post(p_post uuid) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select coalesce((
    select case
      when app.is_owner() then true
      when p.creator_id = app.uid() and app.is_active() then true
      when p.hidden_at is not null then false
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

drop policy posts_select on app.posts;
create policy posts_select on app.posts for select to mk_app
  using (app.can_see_creator(creator_id) and (hidden_at is null or app.is_owner() or creator_id = app.uid()));
grant update (hidden_at, hidden_reason) on app.posts to mk_app;
create policy posts_owner_moderate on app.posts for update to mk_app using (app.is_owner()) with check (app.is_owner());

revoke all on function app.is_blocked_between(uuid, uuid) from public;
grant execute on function app.is_blocked_between(uuid, uuid) to mk_app;

-- Blocks: each user manages their own; nobody can block the house.
-- (Lookup must be SECURITY DEFINER: inside a policy, app.users is itself
-- filtered by RLS, so a plain subquery would never "see" the owner.)
create function app.is_owner_account(p_user uuid) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select exists (select 1 from app.users where id = p_user and role = 'owner')
$$;
revoke all on function app.is_owner_account(uuid) from public;
grant execute on function app.is_owner_account(uuid) to mk_app;

grant select, insert, delete on app.blocks to mk_app;
create policy blocks_select on app.blocks for select to mk_app using (blocker_id = app.uid() or app.is_owner());
create policy blocks_insert on app.blocks for insert to mk_app
  with check (blocker_id = app.uid() and app.is_active() and not app.is_owner_account(blocked_id));
create policy blocks_delete on app.blocks for delete to mk_app using (blocker_id = app.uid());

-- Names of people I've blocked (I can no longer "see" blocked creators through RLS).
create function app.my_blocks() returns table (user_id uuid, name text, handle text, created_at timestamptz)
language sql stable security definer set search_path = app, pg_temp as $$
  select b.blocked_id, coalesce(c.display_name, u.alias::text), c.handle::text, b.created_at
    from app.blocks b join app.users u on u.id = b.blocked_id left join app.creators c on c.user_id = b.blocked_id
   where b.blocker_id = app.uid()
   order by b.created_at desc
$$;
revoke all on function app.my_blocks() from public;
grant execute on function app.my_blocks() to mk_app;

-- Reports: active users file their own; only the owner can read the table.
-- (Reporters see a narrow status view via app.my_reports(), never the
-- owner's resolution notes or escalation references.)
grant insert (id, reporter_id, target_type, target_id, target_user_id, reason, details) on app.reports to mk_app;
create policy reports_insert on app.reports for insert to mk_app with check (reporter_id = app.uid() and app.is_active());

create function app.my_reports() returns table (id uuid, target_type app.report_target, reason app.report_reason, status app.report_status, created_at timestamptz)
language sql stable security definer set search_path = app, pg_temp as $$
  select r.id, r.target_type, r.reason, r.status, r.created_at from app.reports r
   where r.reporter_id = app.uid() order by r.created_at desc limit 50
$$;
revoke all on function app.my_reports() from public;
grant execute on function app.my_reports() to mk_app;

-- Owner: full read/update.
grant select, update (status, resolution_note, escalation_ref, resolved_by, resolved_at, updated_at) on app.reports to mk_app;
create policy reports_owner_select on app.reports for select to mk_app using (app.is_owner());
create policy reports_owner_update on app.reports for update to mk_app using (app.is_owner()) with check (app.is_owner());

grant select, insert on app.moderation_actions to mk_app;
create policy modactions_owner on app.moderation_actions for all to mk_app using (app.is_owner()) with check (app.is_owner() and actor_id = app.uid());
