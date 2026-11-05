-- Phase 7b: Blasts (creator broadcasts) and 7c: appeals of messaging pauses.
-- Each Blast is delivered as an individual message in a private conversation;
-- recipients never see each other. Delivery runs in a background worker
-- (system role) with idempotency per (blast, fan). Paid Blasts are prepared
-- but locked by CHECK until payments exist.

-- ---------------------------------------------------------------- opt-outs
create table app.blast_opt_outs (
  fan_id     uuid not null references app.users(id) on delete cascade,
  creator_id uuid not null references app.creators(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (fan_id, creator_id)
);
alter table app.blast_opt_outs enable row level security;
grant select, insert, delete on app.blast_opt_outs to mk_app;
create policy optout_own on app.blast_opt_outs for all to mk_app using (fan_id = app.uid()) with check (fan_id = app.uid());

-- ---------------------------------------------------------------- custom lists (members only, never followers' identities)
create table app.blast_lists (
  id         uuid primary key default gen_random_uuid(),
  creator_id uuid not null references app.creators(user_id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (creator_id, name)
);
create table app.blast_list_members (
  list_id uuid not null references app.blast_lists(id) on delete cascade,
  fan_id  uuid not null references app.users(id) on delete cascade,
  primary key (list_id, fan_id)
);
alter table app.blast_lists enable row level security;
alter table app.blast_list_members enable row level security;
grant select, insert, delete on app.blast_lists, app.blast_list_members to mk_app;
grant update (name) on app.blast_lists to mk_app;

create function app.owns_blast_list(p_list uuid) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select exists (select 1 from app.blast_lists where id = p_list and creator_id = app.uid()) and app.viewer_role() = 'creator'
$$;
-- A fan can be added to a list only if they are (or were) a member of this creator.
create function app.is_member_ever(p_creator uuid, p_fan uuid) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select exists (select 1 from app.subscriptions s where s.creator_id = p_creator and s.fan_id = p_fan)
$$;
revoke all on function app.owns_blast_list(uuid), app.is_member_ever(uuid, uuid) from public;
grant execute on function app.owns_blast_list(uuid), app.is_member_ever(uuid, uuid) to mk_app;

create policy lists_own on app.blast_lists for all to mk_app
  using (creator_id = app.uid() and app.viewer_role() = 'creator')
  with check (creator_id = app.uid() and app.viewer_role() = 'creator');
create policy list_members_own on app.blast_list_members for all to mk_app
  using (app.owns_blast_list(list_id))
  with check (app.owns_blast_list(list_id) and app.is_member_ever(app.uid(), fan_id));

-- ---------------------------------------------------------------- templates
create table app.blast_templates (
  id         uuid primary key default gen_random_uuid(),
  creator_id uuid not null references app.creators(user_id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 60),
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  unique (creator_id, name)
);
alter table app.blast_templates enable row level security;
grant select, insert, delete on app.blast_templates to mk_app;
grant update (name, body) on app.blast_templates to mk_app;
create policy templates_own on app.blast_templates for all to mk_app
  using (creator_id = app.uid() and app.viewer_role() = 'creator')
  with check (creator_id = app.uid() and app.viewer_role() = 'creator');

-- ---------------------------------------------------------------- blasts
create table app.blasts (
  id           uuid primary key default gen_random_uuid(),
  creator_id   uuid not null references app.creators(user_id) on delete cascade,
  segment      text not null check (segment in ('members', 'vip', 'followers', 'expired', 'new', 'list')),
  list_id      uuid references app.blast_lists(id) on delete set null,
  body         text not null check (char_length(body) between 1 and 2000
                                    and body !~* '(https?://|www\.|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})'),
  price_cents  int check (price_cents is null), -- paid Blasts locked until payments exist
  scheduled_at timestamptz not null,
  status       text not null default 'scheduled' check (status in ('scheduled', 'sending', 'sent', 'canceled')),
  recipients   int not null default 0,
  delivered    int not null default 0,
  skipped      int not null default 0,
  failed       int not null default 0,
  created_at   timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz,
  check (segment = 'list' or list_id is null)
);
create index blasts_due on app.blasts (scheduled_at) where status in ('scheduled', 'sending');
create index blasts_creator on app.blasts (creator_id, created_at desc);
alter table app.blasts enable row level security;
grant select, insert on app.blasts to mk_app;
grant update (status) on app.blasts to mk_app;
create policy blasts_select on app.blasts for select to mk_app using (creator_id = app.uid() or app.is_owner());
create policy blasts_insert on app.blasts for insert to mk_app
  with check (creator_id = app.uid() and app.viewer_role() = 'creator' and status = 'scheduled'
              and recipients = 0 and delivered = 0 and skipped = 0 and failed = 0
              and (list_id is null or app.owns_blast_list(list_id)));
-- The creator may only cancel a Blast that hasn't started.
create policy blasts_cancel on app.blasts for update to mk_app
  using (creator_id = app.uid() and status = 'scheduled')
  with check (creator_id = app.uid() and status = 'canceled');

-- One row per (blast, fan): the idempotency key for delivery.
create table app.blast_deliveries (
  blast_id   uuid not null references app.blasts(id) on delete cascade,
  fan_id     uuid not null references app.users(id) on delete cascade,
  status     text not null default 'queued' check (status in ('queued', 'delivered', 'skipped', 'failed')),
  attempts   int not null default 0,
  message_id uuid references app.messages(id) on delete set null,
  reason     text check (char_length(reason) <= 120),
  updated_at timestamptz not null default now(),
  primary key (blast_id, fan_id)
);
create index blast_deliveries_queued on app.blast_deliveries (blast_id) where status = 'queued';
alter table app.blast_deliveries enable row level security;
-- No mk_app access: creators see aggregate counts on app.blasts only.
create policy deliveries_none on app.blast_deliveries for select to mk_app using (false);
grant select on app.blast_deliveries to mk_app;

-- Messages created by a Blast point at it.
alter table app.messages add constraint messages_blast_fk foreign key (blast_id) references app.blasts(id) on delete set null;

-- Segment membership, evaluated at delivery time (system role only).
create function app.blast_audience(p_blast uuid) returns table (fan_id uuid)
language sql stable security definer set search_path = app, pg_temp as $$
  with b as (select * from app.blasts where id = p_blast),
  base as (
    select s.fan_id from app.subscriptions s, b
     where s.creator_id = b.creator_id and b.segment = 'members' and s.status = 'active' and s.current_period_end > now()
    union
    select s.fan_id from app.subscriptions s join app.tiers t on t.id = s.tier_id, b
     where s.creator_id = b.creator_id and b.segment = 'vip' and t.kind = 'vip' and s.status = 'active' and s.current_period_end > now()
    union
    select f.fan_id from app.follows f, b where f.creator_id = b.creator_id and b.segment = 'followers'
    union
    select s.fan_id from app.subscriptions s, b
     where s.creator_id = b.creator_id and b.segment = 'expired'
       and not exists (select 1 from app.subscriptions x where x.creator_id = b.creator_id and x.fan_id = s.fan_id and x.status = 'active' and x.current_period_end > now())
    union
    select s.fan_id from app.subscriptions s, b
     where s.creator_id = b.creator_id and b.segment = 'new' and s.status = 'active' and s.current_period_end > now() and s.created_at > now() - interval '30 days'
    union
    select m.fan_id from app.blast_list_members m, b
     where b.segment = 'list' and m.list_id = b.list_id
  )
  select distinct base.fan_id from base, b where base.fan_id <> b.creator_id
$$;
revoke all on function app.blast_audience(uuid) from public;
-- Deliberately not granted to mk_app: only the worker (system role) resolves recipients.

-- Aggregate audience sizes for the composer (counts only, never identities).
create function app.my_blast_segment_counts()
returns table (segment text, n int)
language sql stable security definer set search_path = app, pg_temp as $$
  with me as (select app.uid() as id where app.viewer_role() = 'creator')
  select 'members', count(distinct s.fan_id)::int from app.subscriptions s, me where s.creator_id = me.id and s.status = 'active' and s.current_period_end > now()
  union all
  select 'vip', count(distinct s.fan_id)::int from app.subscriptions s join app.tiers t on t.id = s.tier_id, me where s.creator_id = me.id and t.kind = 'vip' and s.status = 'active' and s.current_period_end > now()
  union all
  select 'followers', count(*)::int from app.follows f, me where f.creator_id = me.id
  union all
  select 'expired', count(distinct s.fan_id)::int from app.subscriptions s, me where s.creator_id = me.id
     and not exists (select 1 from app.subscriptions x where x.creator_id = me.id and x.fan_id = s.fan_id and x.status = 'active' and x.current_period_end > now())
  union all
  select 'new', count(distinct s.fan_id)::int from app.subscriptions s, me where s.creator_id = me.id and s.status = 'active' and s.current_period_end > now() and s.created_at > now() - interval '30 days'
$$;

-- Members (current or past) a creator may add to custom lists: aliases only.
create function app.my_member_directory()
returns table (fan_id uuid, alias text, current boolean)
language sql stable security definer set search_path = app, pg_temp as $$
  select s.fan_id, u.alias::text, bool_or(s.status = 'active' and s.current_period_end > now())
    from app.subscriptions s join app.users u on u.id = s.fan_id and u.status = 'active'
   where s.creator_id = app.uid() and app.viewer_role() = 'creator' and not app.is_blocked_between(s.creator_id, s.fan_id)
   group by s.fan_id, u.alias
$$;

-- Engagement for a creator's own Blast: aggregate counts only.
create function app.my_blast_engagement(p_blast uuid) returns table (read_count int, reply_count int)
language sql stable security definer set search_path = app, pg_temp as $$
  select
    (select count(*)::int from app.messages m join app.conversations c on c.id = m.conversation_id
      where m.blast_id = p_blast and c.fan_last_read_at >= m.created_at),
    (select count(distinct m.conversation_id)::int from app.messages m
      where m.blast_id = p_blast and exists (
        select 1 from app.messages r where r.conversation_id = m.conversation_id and r.sender_id <> m.sender_id and r.created_at > m.created_at))
   where exists (select 1 from app.blasts where id = p_blast and creator_id = app.uid())
$$;

revoke all on function app.my_blast_segment_counts(), app.my_member_directory(), app.my_blast_engagement(uuid) from public;
grant execute on function app.my_blast_segment_counts(), app.my_member_directory(), app.my_blast_engagement(uuid) to mk_app;

-- ---------------------------------------------------------------- 7c: appeals of messaging pauses
create table app.messaging_appeals (
  id             uuid primary key default gen_random_uuid(),
  restriction_id uuid not null references app.messaging_restrictions(id) on delete cascade,
  user_id        uuid not null references app.users(id) on delete cascade,
  body           text not null check (char_length(body) between 10 and 1000),
  status         text not null default 'open' check (status in ('open', 'upheld', 'overturned')),
  decision_note  text check (char_length(decision_note) <= 500),
  decided_by     uuid references app.users(id),
  decided_at     timestamptz,
  created_at     timestamptz not null default now(),
  unique (restriction_id)
);
alter table app.messaging_appeals enable row level security;
grant select, insert on app.messaging_appeals to mk_app;
grant update (status, decision_note, decided_by, decided_at) on app.messaging_appeals to mk_app;

create function app.owns_restriction(p_restriction uuid) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select exists (select 1 from app.messaging_restrictions where id = p_restriction and user_id = app.uid() and lifted_at is null and until > now())
$$;
revoke all on function app.owns_restriction(uuid) from public;
grant execute on function app.owns_restriction(uuid) to mk_app;

create policy appeals_select on app.messaging_appeals for select to mk_app using (user_id = app.uid() or app.is_owner());
create policy appeals_insert on app.messaging_appeals for insert to mk_app
  with check (user_id = app.uid() and status = 'open' and decided_by is null and app.owns_restriction(restriction_id));
create policy appeals_decide on app.messaging_appeals for update to mk_app
  using (app.is_owner() and status = 'open') with check (app.is_owner() and status in ('upheld', 'overturned') and decided_by = app.uid());
