-- ============================================================================
-- Migration: 20261124000001_fan_dashboard_and_paid_messages.sql
-- Purpose:
--   1. Support creator-sent locked paid messages (`price_cents`, `preview_text`,
--      `media_kind`) and server-verified fan message entitlements
--      (`app.message_purchases`).
--   2. Enforce strict RLS and SECURITY DEFINER masking so locked message body
--      text is NEVER returned to a fan before payment verification.
--   3. Provide fan payment receipt history (`app.my_payment_receipts()`) without
--      exposing raw `app.payments` table privileges to `mk_app`.
--   4. Provide fan account notification preferences (`app.user_preferences`).
-- ============================================================================

-- 1. Extend app.messages for creator paid messages
alter table app.messages
  drop constraint if exists messages_price_cents_check;

alter table app.messages
  add column if not exists preview_text text
    check (preview_text is null or char_length(btrim(preview_text)) between 1 and 280),
  add column if not exists media_kind text
    check (media_kind is null or media_kind in ('text', 'image', 'set', 'video', 'audio'));

alter table app.messages
  add constraint messages_price_cents_check
    check (
      price_cents is null
      or (price_cents between 100 and 100000 and preview_text is not null)
    );

-- Guard trigger (SECURITY INVOKER per schema-lint) ensuring only the conversation's
-- creator can send a paid message.
create or replace function app.messages_paid_guard()
returns trigger
language plpgsql
set search_path = app, pg_temp
as $$
declare
  v_creator uuid;
begin
  if new.price_cents is not null then
    select c.creator_id into v_creator
      from app.conversations c
     where c.id = new.conversation_id;
    if v_creator is null or new.sender_id <> v_creator then
      raise exception 'only creators may send paid messages' using errcode = '23514';
    end if;
    if new.preview_text is null or char_length(btrim(new.preview_text)) = 0 then
      raise exception 'paid messages require a safe preview' using errcode = '23514';
    end if;
    new.preview_text := btrim(new.preview_text);
    new.media_kind := coalesce(new.media_kind, 'text');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_messages_paid_guard on app.messages;
create trigger trg_messages_paid_guard
  before insert or update on app.messages
  for each row
  execute function app.messages_paid_guard();

-- 2. Create app.message_purchases for paid message unlocks
create table if not exists app.message_purchases (
  id         uuid primary key default gen_random_uuid(),
  fan_id     uuid not null references app.users(id) on delete cascade,
  message_id uuid not null references app.messages(id) on delete cascade,
  payment_id uuid references app.payments(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (fan_id, message_id)
);

create index if not exists message_purchases_fan_idx
  on app.message_purchases (fan_id, created_at desc);
create index if not exists message_purchases_message_idx
  on app.message_purchases (message_id);

alter table app.message_purchases enable row level security;
revoke all on table app.message_purchases from public;
grant select on table app.message_purchases to mk_app;

drop policy if exists message_purchases_select on app.message_purchases;
create policy message_purchases_select on app.message_purchases
  for select to mk_app
  using (fan_id = app.uid() or app.is_owner());

-- 3. Entitlement helper: can the current viewer read the full body of a message?
create or replace function app.can_view_message(p_message uuid)
returns boolean
language sql
stable
security definer
set search_path = app, pg_temp
as $$
  select exists (
    select 1
      from app.messages m
     where m.id = p_message
       and (
         m.price_cents is null
         or m.sender_id = app.uid()
         or exists (
           select 1
             from app.message_purchases mp
            where mp.message_id = m.id
              and mp.fan_id = app.uid()
         )
       )
  )
$$;

revoke all on function app.can_view_message(uuid) from public;
grant execute on function app.can_view_message(uuid) to mk_app;

-- Update RLS on app.messages so direct table reads never expose locked paid message rows
drop policy if exists messages_participants on app.messages;
create policy messages_participants on app.messages
  for select to mk_app
  using (
    app.is_conversation_participant(conversation_id)
    and (status = 'sent' or sender_id = app.uid())
    and app.can_view_message(id)
  );

-- 4. Safe conversation message listing (masks body when locked)
create or replace function app.list_conversation_messages(
  p_conv uuid,
  p_after timestamptz default null
)
returns table (
  id uuid,
  sender_id uuid,
  body text,
  preview_text text,
  media_kind text,
  price_cents int,
  unlocked boolean,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = app, pg_temp
as $$
  select
    m.id,
    m.sender_id,
    case when app.can_view_message(m.id) then m.body else null end as body,
    m.preview_text,
    m.media_kind,
    m.price_cents,
    app.can_view_message(m.id) as unlocked,
    m.status,
    m.created_at
  from app.messages m
  where m.conversation_id = p_conv
    and app.is_conversation_participant(p_conv)
    and (m.status = 'sent' or m.sender_id = app.uid())
    and (p_after is null or m.created_at > p_after)
  order by m.created_at desc
  limit 100
$$;

revoke all on function app.list_conversation_messages(uuid, timestamptz) from public;
grant execute on function app.list_conversation_messages(uuid, timestamptz) to mk_app;

-- Safe latest message summary for a conversation (never leaks locked body in list preview)
create or replace function app.conversation_last_message(p_conv uuid)
returns table (
  id uuid,
  sender_id uuid,
  preview text,
  price_cents int,
  unlocked boolean
)
language sql
stable
security definer
set search_path = app, pg_temp
as $$
  select
    m.id,
    m.sender_id,
    case
      when app.can_view_message(m.id) then m.body
      else coalesce(m.preview_text, 'Exclusive message')
    end as preview,
    m.price_cents,
    app.can_view_message(m.id) as unlocked
  from app.messages m
  where m.conversation_id = p_conv
    and app.is_conversation_participant(p_conv)
    and m.status = 'sent'
  order by m.created_at desc
  limit 1
$$;

revoke all on function app.conversation_last_message(uuid) from public;
grant execute on function app.conversation_last_message(uuid) to mk_app;

-- Lookup a paid message for checkout quoting (returns safe metadata only, never body)
create or replace function app.paid_message_quote(p_message uuid)
returns table (
  message_id uuid,
  conversation_id uuid,
  creator_id uuid,
  fan_id uuid,
  price_cents int,
  preview_text text,
  media_kind text,
  unlocked boolean
)
language sql
stable
security definer
set search_path = app, pg_temp
as $$
  select
    m.id as message_id,
    m.conversation_id,
    c.creator_id,
    c.fan_id,
    m.price_cents,
    m.preview_text,
    coalesce(m.media_kind, 'text') as media_kind,
    app.can_view_message(m.id) as unlocked
  from app.messages m
  join app.conversations c on c.id = m.conversation_id
  where m.id = p_message
    and m.status = 'sent'
    and m.price_cents is not null
    and (c.fan_id = app.uid() or c.creator_id = app.uid())
$$;

revoke all on function app.paid_message_quote(uuid) from public;
grant execute on function app.paid_message_quote(uuid) to mk_app;

-- 5. Allow creators to send paid messages in their conversations
create or replace function app.send_paid_message(
  p_conv uuid,
  p_body text,
  p_preview_text text,
  p_price_cents int,
  p_media_kind text default 'text',
  p_client_key text default null,
  p_status text default 'sent',
  p_score int default 0,
  p_rules text[] default '{}'
)
returns uuid
language plpgsql
volatile
security definer
set search_path = app, pg_temp
as $$
declare
  verdict text := app.can_send_in(p_conv);
  v_conv app.conversations;
  mid uuid;
begin
  if verdict <> 'ok' then
    raise exception 'messaging: %', verdict using errcode = '42501';
  end if;
  select * into v_conv from app.conversations where id = p_conv;
  if not found or v_conv.creator_id <> app.uid() then
    raise exception 'only creators may send paid messages' using errcode = '42501';
  end if;
  if p_status not in ('sent', 'held') then
    raise exception 'bad status' using errcode = '22023';
  end if;
  if p_price_cents is null or p_price_cents < 100 or p_price_cents > 100000 then
    raise exception 'invalid price_cents' using errcode = '22023';
  end if;
  if p_preview_text is null or char_length(btrim(p_preview_text)) < 1 or char_length(btrim(p_preview_text)) > 280 then
    raise exception 'invalid preview_text' using errcode = '22023';
  end if;

  insert into app.messages (
    conversation_id, sender_id, body, preview_text, media_kind, price_cents,
    client_key, status, risk_score, risk_rules
  )
  values (
    p_conv, app.uid(), p_body, btrim(p_preview_text), coalesce(p_media_kind, 'text'), p_price_cents,
    p_client_key, p_status, greatest(p_score, 0), coalesce(p_rules, '{}')
  )
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
end;
$$;

revoke all on function app.send_paid_message(uuid, text, text, int, text, text, text, int, text[]) from public;
grant execute on function app.send_paid_message(uuid, text, text, int, text, text, text, int, text[]) to mk_app;

-- 6. Fan payment receipts & unlocked messages helper functions
create or replace function app.my_payment_receipts()
returns table (
  id uuid,
  kind text,
  creator_id uuid,
  target_id uuid,
  amount_cents int,
  currency char(3),
  status text,
  provider text,
  provider_ref text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = app, pg_temp
as $$
  select
    p.id,
    p.kind,
    p.creator_id,
    p.target_id,
    p.amount_cents,
    p.currency,
    p.status,
    p.provider,
    p.provider_ref,
    p.created_at,
    p.updated_at
  from app.payments p
  where p.fan_id = app.uid()
    and app.is_active()
  order by p.created_at desc
  limit 100
$$;

revoke all on function app.my_payment_receipts() from public;
grant execute on function app.my_payment_receipts() to mk_app;

-- 7. Fan Account Notification Preferences
create table if not exists app.user_preferences (
  user_id            uuid primary key references app.users(id) on delete cascade,
  notify_new_posts   boolean not null default true,
  notify_messages    boolean not null default true,
  notify_billing     boolean not null default true,
  updated_at         timestamptz not null default now()
);

alter table app.user_preferences enable row level security;
revoke all on table app.user_preferences from public;
grant select, insert, update (notify_new_posts, notify_messages, notify_billing, updated_at) on table app.user_preferences to mk_app;

drop policy if exists user_preferences_own on app.user_preferences;
create policy user_preferences_own on app.user_preferences
  for all to mk_app
  using (user_id = app.uid())
  with check (user_id = app.uid());

