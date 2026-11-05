-- Phase 7a: private messaging (free text). Creator-controlled, block-aware,
-- moderated without letting the house browse conversations.
-- NOT end-to-end encrypted: messages are stored server-side, readable only
-- through participant RLS, reported-message context, or audited exceptional
-- access by the owner.

-- ---------------------------------------------------------------- creator settings
create table app.messaging_settings (
  creator_id          uuid primary key references app.creators(user_id) on delete cascade,
  members_can_message boolean not null default true,
  -- Paid message requests from non-members. Stored now; cannot be switched on
  -- until a payment provider is approved (enforced below and in the app).
  requests_enabled    boolean not null default false check (not requests_enabled),
  request_price_cents int check (request_price_cents is null or request_price_cents between 100 and 100000),
  updated_at          timestamptz not null default now()
);
alter table app.messaging_settings enable row level security;
grant select, insert, update (members_can_message, request_price_cents, updated_at) on app.messaging_settings to mk_app;
create policy msgset_own on app.messaging_settings for all to mk_app
  using (creator_id = app.uid() and app.viewer_role() = 'creator')
  with check (creator_id = app.uid() and app.viewer_role() = 'creator');

-- ---------------------------------------------------------------- conversations
create table app.conversations (
  id                   uuid primary key default gen_random_uuid(),
  fan_id               uuid not null references app.users(id) on delete cascade,
  creator_id           uuid not null references app.creators(user_id) on delete cascade,
  created_at           timestamptz not null default now(),
  last_message_at      timestamptz,
  fan_last_read_at     timestamptz,
  creator_last_read_at timestamptz,
  fan_muted            boolean not null default false,
  creator_muted        boolean not null default false,
  -- The creator stops this fan from sending (without a full block).
  creator_restricted   boolean not null default false,
  unique (fan_id, creator_id),
  check (fan_id <> creator_id)
);
create index conversations_fan on app.conversations (fan_id, last_message_at desc nulls last);
create index conversations_creator on app.conversations (creator_id, last_message_at desc nulls last);
alter table app.conversations enable row level security;
grant select on app.conversations to mk_app;
create policy conversations_participants on app.conversations for select to mk_app
  using (fan_id = app.uid() or creator_id = app.uid());
-- All writes go through the definer functions below.

-- ---------------------------------------------------------------- messages
create table app.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references app.conversations(id) on delete cascade,
  sender_id       uuid not null references app.users(id) on delete cascade,
  body            text not null check (char_length(body) between 1 and 2000),
  kind            text not null default 'text' check (kind in ('text')),
  -- Paid messages are prepared but locked until payments exist.
  price_cents     int check (price_cents is null),
  blast_id        uuid,
  client_key      text check (client_key ~ '^[A-Za-z0-9_-]{8,64}$'),
  -- 'held': withheld from the recipient pending house review (risk rules or a critical report).
  status          text not null default 'sent' check (status in ('sent', 'held', 'removed')),
  -- Explainable risk result (rule names only), for house review of held messages.
  risk_score      int not null default 0 check (risk_score >= 0),
  risk_rules      text[] not null default '{}',
  created_at      timestamptz not null default now(),
  unique (sender_id, client_key),
  -- Backstop for the app's filter: no links or email addresses.
  check (body !~* '(https?://|www\.|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})')
);
create index messages_conversation on app.messages (conversation_id, created_at desc);
create index messages_sender_recent on app.messages (sender_id, created_at desc);
alter table app.messages enable row level security;
grant select on app.messages to mk_app;
-- (select policy is created after its helper, below)

-- ---------------------------------------------------------------- restrictions (automatic or by the house)
create table app.messaging_restrictions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references app.users(id) on delete cascade,
  until      timestamptz not null,
  reason     text not null check (char_length(reason) between 3 and 300),
  created_by uuid references app.users(id), -- null = automatic
  created_at timestamptz not null default now(),
  lifted_at  timestamptz,
  lifted_by  uuid references app.users(id)
);
create index messaging_restrictions_user on app.messaging_restrictions (user_id, until desc);
alter table app.messaging_restrictions enable row level security;
grant select on app.messaging_restrictions to mk_app;
grant insert on app.messaging_restrictions to mk_app;
grant update (lifted_at, lifted_by) on app.messaging_restrictions to mk_app;
create policy restrictions_select on app.messaging_restrictions for select to mk_app using (user_id = app.uid() or app.is_owner());
create policy restrictions_owner_insert on app.messaging_restrictions for insert to mk_app with check (app.is_owner() and created_by = app.uid());
create policy restrictions_owner_update on app.messaging_restrictions for update to mk_app using (app.is_owner()) with check (app.is_owner());

-- ---------------------------------------------------------------- helpers
create function app.is_conversation_participant(p_conv uuid) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select exists (select 1 from app.conversations c where c.id = p_conv and (c.fan_id = app.uid() or c.creator_id = app.uid()))
$$;

create function app.messaging_restricted(p_user uuid) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select exists (select 1 from app.messaging_restrictions r where r.user_id = p_user and r.lifted_at is null and r.until > now())
$$;

-- Is this fan in the creator's audience (current or past member, or follower)?
create function app.in_audience(p_creator uuid, p_fan uuid) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select exists (select 1 from app.subscriptions s where s.creator_id = p_creator and s.fan_id = p_fan)
      or exists (select 1 from app.follows f where f.creator_id = p_creator and f.fan_id = p_fan)
$$;

create function app.is_current_member(p_creator uuid, p_fan uuid) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select exists (select 1 from app.subscriptions s
                  where s.creator_id = p_creator and s.fan_id = p_fan and s.status = 'active' and s.current_period_end > now())
$$;

-- Participants see sent messages; senders also see their own held ones.
create policy messages_participants on app.messages for select to mk_app
  using (app.is_conversation_participant(conversation_id) and (status = 'sent' or sender_id = app.uid()));

-- The single source of truth for "may the caller send in this conversation?"
create function app.can_send_in(p_conv uuid) returns text
language plpgsql stable security definer set search_path = app, pg_temp as $$
declare c app.conversations; me uuid := app.uid(); other uuid; allow boolean;
begin
  select * into c from app.conversations where id = p_conv;
  if not found or me is null or (me <> c.fan_id and me <> c.creator_id) then return 'not_found'; end if;
  other := case when me = c.fan_id then c.creator_id else c.fan_id end;
  if not app.is_active() or not exists (select 1 from app.users where id = other and status = 'active') then return 'unavailable'; end if;
  if app.is_blocked_between(me, other) then return 'unavailable'; end if;
  if app.messaging_restricted(me) then return 'restricted'; end if;
  if me = c.fan_id then
    if c.creator_restricted then return 'creator_restricted'; end if;
    if not app.can_see_creator(c.creator_id) then return 'unavailable'; end if;
    select coalesce((select members_can_message from app.messaging_settings where creator_id = c.creator_id), true) into allow;
    if not allow then return 'creator_closed'; end if;
    if not app.is_current_member(c.creator_id, me) then return 'members_only'; end if;
  else
    if not exists (select 1 from app.creators where user_id = me and published_at is not null) then return 'unpublished'; end if;
    if not app.in_audience(me, c.fan_id) then return 'not_audience'; end if;
  end if;
  return 'ok';
end $$;

-- Open (or find) a conversation. A fan opens with a creator they're a current
-- member of; a creator opens with a current member. Returns the id or null.
create function app.open_conversation(p_other uuid) returns uuid
language plpgsql volatile security definer set search_path = app, pg_temp as $$
declare me uuid := app.uid(); role app.user_role := app.viewer_role(); fan uuid; creator uuid; cid uuid;
begin
  if me is null or role is null or role = 'owner' or p_other = me then return null; end if;
  if exists (select 1 from app.creators where user_id = p_other) and app.is_current_member(p_other, me) then
    fan := me; creator := p_other;
  elsif role = 'creator' and app.is_current_member(me, p_other) then
    fan := p_other; creator := me;
  else
    return null;
  end if;
  if app.is_blocked_between(fan, creator) then return null; end if;
  insert into app.conversations (fan_id, creator_id) values (fan, creator)
    on conflict (fan_id, creator_id) do update set fan_id = excluded.fan_id
    returning id into cid;
  return cid;
end $$;

-- Send. All permission checks run here; content rules run in the app first
-- (risk scoring) and the table CHECK is the backstop.
create function app.send_message(p_conv uuid, p_body text, p_client_key text, p_status text default 'sent', p_score int default 0, p_rules text[] default '{}') returns uuid
language plpgsql volatile security definer set search_path = app, pg_temp as $$
declare verdict text := app.can_send_in(p_conv); mid uuid;
begin
  if verdict <> 'ok' then raise exception 'messaging: %', verdict using errcode = '42501'; end if;
  if p_status not in ('sent', 'held') then raise exception 'bad status' using errcode = '22023'; end if;
  insert into app.messages (conversation_id, sender_id, body, client_key, status, risk_score, risk_rules)
    values (p_conv, app.uid(), p_body, p_client_key, p_status, greatest(p_score, 0), coalesce(p_rules, '{}'))
    on conflict (sender_id, client_key) do nothing
    returning id into mid;
  if mid is null then
    select id into mid from app.messages where sender_id = app.uid() and client_key = p_client_key;
    return mid;
  end if;
  if p_status = 'sent' then
    update app.conversations set last_message_at = now() where id = p_conv;
  end if;
  return mid;
end $$;

-- Per-side conversation settings.
create function app.set_conversation_flags(p_conv uuid, p_muted boolean default null, p_restricted boolean default null, p_read boolean default false) returns boolean
language plpgsql volatile security definer set search_path = app, pg_temp as $$
declare c app.conversations; me uuid := app.uid();
begin
  select * into c from app.conversations where id = p_conv;
  if not found or (me <> c.fan_id and me <> c.creator_id) then return false; end if;
  if me = c.fan_id then
    if p_restricted is not null then return false; end if;
    update app.conversations set fan_muted = coalesce(p_muted, fan_muted),
           fan_last_read_at = case when p_read then now() else fan_last_read_at end where id = p_conv;
  else
    update app.conversations set creator_muted = coalesce(p_muted, creator_muted),
           creator_restricted = coalesce(p_restricted, creator_restricted),
           creator_last_read_at = case when p_read then now() else creator_last_read_at end where id = p_conv;
  end if;
  return true;
end $$;

-- House: the reported message plus minimal surrounding context (two before,
-- one after, same conversation, within 24 hours). Every call is audited.
create function app.reported_message_context(p_report uuid)
returns table (id uuid, sender_id uuid, body text, status text, created_at timestamptz, is_reported boolean)
language plpgsql volatile security definer set search_path = app, pg_temp as $$
declare r app.reports; m app.messages;
begin
  if not app.is_owner() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into r from app.reports where reports.id = p_report and target_type = 'message';
  if not found then return; end if;
  select * into m from app.messages where messages.id = r.target_id;
  if not found then return; end if;
  insert into app.audit_log (actor_id, action, target_type, target_id, metadata)
    values (app.uid(), 'moderation.message_context', 'report', p_report, jsonb_build_object('message', m.id));
  return query
    (select x.id, x.sender_id, x.body, x.status, x.created_at, x.id = m.id from app.messages x
      where x.conversation_id = m.conversation_id and x.created_at <= m.created_at and x.created_at > m.created_at - interval '24 hours'
      order by x.created_at desc limit 3)
    union all
    (select x.id, x.sender_id, x.body, x.status, x.created_at, false from app.messages x
      where x.conversation_id = m.conversation_id and x.created_at > m.created_at and x.created_at < m.created_at + interval '24 hours'
      order by x.created_at asc limit 1);
end $$;

-- Exceptional access for a serious safety or legal incident. Requires a
-- written justification, is owner-only at AAL2, and is written to the
-- append-only audit log BEFORE any content is returned.
create function app.exceptional_conversation_access(p_conv uuid, p_justification text)
returns table (id uuid, sender_id uuid, body text, status text, created_at timestamptz)
language plpgsql volatile security definer set search_path = app, pg_temp as $$
begin
  if not app.is_owner() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_justification is null or char_length(trim(p_justification)) < 40 then
    raise exception 'a written justification of at least 40 characters is required' using errcode = '22023';
  end if;
  if not exists (select 1 from app.conversations where conversations.id = p_conv) then return; end if;
  insert into app.audit_log (actor_id, action, target_type, target_id, metadata)
    values (app.uid(), 'moderation.exceptional_access', 'conversation', p_conv, jsonb_build_object('justification', left(trim(p_justification), 1000)));
  return query select x.id, x.sender_id, x.body, x.status, x.created_at from app.messages x
    where x.conversation_id = p_conv order by x.created_at desc limit 200;
end $$;

-- The other side of the caller's conversations, for display. Creators see a
-- fan's alias only for conversations they are part of.
create function app.my_conversation_peers()
returns table (conversation_id uuid, my_side text, peer_id uuid, peer_alias text)
language sql stable security definer set search_path = app, pg_temp as $$
  select c.id, case when c.fan_id = app.uid() then 'fan' else 'creator' end,
         case when c.fan_id = app.uid() then c.creator_id else c.fan_id end,
         u.alias::text
    from app.conversations c
    join app.users u on u.id = case when c.fan_id = app.uid() then c.creator_id else c.fan_id end
   where (c.fan_id = app.uid() or c.creator_id = app.uid()) and app.is_active()
$$;

-- A creator's current members (aliases only) for starting a conversation.
create function app.my_current_members()
returns table (fan_id uuid, alias text, tier_kind text, since timestamptz)
language sql stable security definer set search_path = app, pg_temp as $$
  select s.fan_id, u.alias::text, t.kind::text, s.created_at
    from app.subscriptions s join app.users u on u.id = s.fan_id and u.status = 'active'
    join app.tiers t on t.id = s.tier_id
   where s.creator_id = app.uid() and app.viewer_role() = 'creator'
     and s.status = 'active' and s.current_period_end > now()
     and not app.is_blocked_between(s.creator_id, s.fan_id)
$$;

-- House review of messages held by the risk rules: minimal fields, audited.
create function app.held_messages()
returns table (id uuid, conversation_id uuid, sender_id uuid, sender_alias text, body text, risk_score int, risk_rules text[], created_at timestamptz)
language plpgsql volatile security definer set search_path = app, pg_temp as $$
begin
  if not app.is_owner() then raise exception 'not allowed' using errcode = '42501'; end if;
  insert into app.audit_log (actor_id, action, target_type, metadata) values (app.uid(), 'moderation.held_queue_view', 'message', '{}'::jsonb);
  return query select m.id, m.conversation_id, m.sender_id, u.alias::text, m.body, m.risk_score, m.risk_rules, m.created_at
    from app.messages m join app.users u on u.id = m.sender_id
   where m.status = 'held' order by m.created_at asc limit 100;
end $$;

create function app.review_held_message(p_message uuid, p_release boolean) returns boolean
language plpgsql volatile security definer set search_path = app, pg_temp as $$
declare conv uuid;
begin
  if not app.is_owner() then raise exception 'not allowed' using errcode = '42501'; end if;
  update app.messages set status = case when p_release then 'sent' else 'removed' end
   where id = p_message and status = 'held' returning conversation_id into conv;
  if conv is null then return false; end if;
  if p_release then update app.conversations set last_message_at = now() where id = conv; end if;
  insert into app.audit_log (actor_id, action, target_type, target_id)
    values (app.uid(), case when p_release then 'moderation.message_release' else 'moderation.message_removed' end, 'message', p_message);
  return true;
end $$;
revoke all on function app.my_conversation_peers(), app.my_current_members(), app.held_messages(), app.review_held_message(uuid, boolean) from public;
grant execute on function app.my_conversation_peers(), app.my_current_members(), app.held_messages(), app.review_held_message(uuid, boolean) to mk_app;

-- House moderation of a single reported message: hold, remove or restore.
create function app.moderate_message(p_message uuid, p_status text, p_report uuid) returns boolean
language plpgsql volatile security definer set search_path = app, pg_temp as $$
declare n int;
begin
  if not app.is_owner() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status not in ('sent', 'held', 'removed') then raise exception 'bad status' using errcode = '22023'; end if;
  if not exists (select 1 from app.reports where id = p_report and target_type = 'message' and target_id = p_message) then return false; end if;
  update app.messages set status = p_status where id = p_message;
  get diagnostics n = row_count;
  insert into app.audit_log (actor_id, action, target_type, target_id, metadata)
    values (app.uid(), 'moderation.message_' || p_status, 'message', p_message, jsonb_build_object('report', p_report));
  return n = 1;
end $$;
revoke all on function app.moderate_message(uuid, text, uuid) from public;
grant execute on function app.moderate_message(uuid, text, uuid) to mk_app;

revoke all on function app.is_conversation_participant(uuid), app.messaging_restricted(uuid), app.in_audience(uuid, uuid),
  app.is_current_member(uuid, uuid), app.can_send_in(uuid), app.open_conversation(uuid), app.send_message(uuid, text, text, text, int, text[]),
  app.set_conversation_flags(uuid, boolean, boolean, boolean), app.reported_message_context(uuid),
  app.exceptional_conversation_access(uuid, text) from public;
grant execute on function app.is_conversation_participant(uuid), app.messaging_restricted(uuid), app.in_audience(uuid, uuid),
  app.is_current_member(uuid, uuid), app.can_send_in(uuid), app.open_conversation(uuid), app.send_message(uuid, text, text, text, int, text[]),
  app.set_conversation_flags(uuid, boolean, boolean, boolean), app.reported_message_context(uuid),
  app.exceptional_conversation_access(uuid, text) to mk_app;

-- ---------------------------------------------------------------- notifications for messages
-- One unread notification per conversation (refreshed on each new message);
-- suppressed when the recipient muted the conversation. No message text.
create function app.notify_message() returns trigger
language plpgsql security definer set search_path = app, pg_temp as $$
declare c app.conversations; recipient uuid; muted boolean; from_alias text;
begin
  if new.status <> 'sent' then return new; end if;
  select * into c from app.conversations where id = new.conversation_id;
  recipient := case when new.sender_id = c.fan_id then c.creator_id else c.fan_id end;
  muted := case when recipient = c.fan_id then c.fan_muted else c.creator_muted end;
  if muted then return new; end if;
  select case when new.sender_id = c.creator_id then (select display_name from app.creators where user_id = c.creator_id) else alias::text end
    into from_alias from app.users where id = new.sender_id;
  delete from app.notifications where user_id = recipient and kind = 'message.received' and read_at is null and data->>'conversation' = c.id::text;
  insert into app.notifications (user_id, kind, creator_id, data)
    values (recipient, 'message.received', c.creator_id, jsonb_build_object('conversation', c.id, 'from', left(from_alias, 60)));
  return new;
end $$;
create trigger messages_notify after insert on app.messages for each row execute function app.notify_message();
create trigger messages_notify_release after update of status on app.messages for each row
  when (old.status = 'held' and new.status = 'sent') execute function app.notify_message();
revoke all on function app.notify_message() from public;
