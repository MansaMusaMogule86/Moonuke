-- ============================================================================
-- Migration: 20261126000001_workspace_and_identity_separation.sql
-- Purpose:
--   1. Separate Fan View identity (`fan_alias`) from public Creator Studio
--      identity (`Diva [chosen name]`) on single authenticated accounts.
--   2. Prevent automatic exposure of a creator's public Diva identity when
--      that account uses Fan View (subscriptions, fan messages, fan chrome).
--   3. Persist preferred workspace (`'studio'` vs `'fan'`) and locale
--      (`'en'`, `'fr'`, `'ar'`) with strict role enforcement.
--   4. Scope conversation peer aliases so creators acting as fans appear under
--      their `fan_alias`, never their `Diva [Name]` creator identity.
-- ============================================================================

-- 1. Add fan_alias, preferred_workspace, and preferred_locale to app.users
alter table app.users
  add column if not exists fan_alias citext,
  add column if not exists preferred_workspace text not null default 'fan',
  add column if not exists preferred_locale text not null default 'en';

alter table app.users drop constraint if exists users_fan_alias_check;
alter table app.users add constraint users_fan_alias_check check (
  fan_alias is null or (
    char_length(fan_alias::text) between 2 and 40
    and fan_alias::text = btrim(fan_alias::text)
    and fan_alias::text !~ '[\x00-\x1F\x7F<>@]'
    and fan_alias::text !~* '^diva(\s+|[:._·—–-]+|$)'
  )
);

alter table app.users drop constraint if exists users_preferred_workspace_check;
alter table app.users add constraint users_preferred_workspace_check check (
  preferred_workspace in ('fan', 'studio')
  and (role = 'creator' or preferred_workspace = 'fan')
);

alter table app.users drop constraint if exists users_preferred_locale_check;
alter table app.users add constraint users_preferred_locale_check check (
  preferred_locale in ('en', 'fr', 'ar')
);

-- 2. Backfill existing accounts:
--    - Members keep their existing alias as fan_alias and 'fan' workspace.
--    - Creators receive a distinct private fan_alias ('Member ' || 4-hex code
--      derived from their immutable UUID) if missing or if it matched their
--      creator identity, and default to 'studio' workspace.
update app.users u
   set fan_alias = case
         when u.role = 'member' then u.alias
         when u.role = 'owner' then u.alias
         else
           case
             when u.fan_alias is not null
              and lower(u.fan_alias::text) <> lower(u.alias::text)
              and u.fan_alias::text !~* '^diva(\s+|[:._·—–-]+|$)'
              and not exists (
                select 1 from app.creators c
                 where c.user_id = u.id
                   and (lower(u.fan_alias::text) = lower(c.creator_name) or lower(u.fan_alias::text) = lower(c.display_name))
              )
             then u.fan_alias
             else ('Member ' || upper(substr(md5(u.id::text), 1, 4)))::citext
           end
       end,
       preferred_workspace = case
         when u.role = 'creator' then 'studio'
         else 'fan'
       end;

-- 3. Guard trigger (SECURITY INVOKER per schema-lint) to initialize fan_alias
--    and preferred_workspace on new user rows and prevent creators from having
--    their creator name auto-copied into fan_alias.
create or replace function app.users_workspace_identity_guard()
returns trigger
language plpgsql
set search_path = app, public, pg_temp
as $$
begin
  if new.id is null then
    new.id := gen_random_uuid();
  end if;

  if tg_op = 'INSERT' then
    if new.role = 'creator' then
      new.preferred_workspace := 'studio';
      if new.fan_alias is null
         or lower(new.fan_alias::text) = lower(new.alias::text)
         or new.fan_alias::text ~* '^diva(\s+|[:._·—–-]+|$)' then
        new.fan_alias := ('Member ' || upper(substr(md5(new.id::text), 1, 4)))::public.citext;
      end if;
    else
      new.preferred_workspace := 'fan';
      if new.fan_alias is null then
        new.fan_alias := new.alias;
      end if;
    end if;
  else
    if new.role <> 'creator' then
      new.preferred_workspace := 'fan';
    end if;
    if new.fan_alias is null then
      if new.role = 'creator' then
        new.fan_alias := ('Member ' || upper(substr(md5(new.id::text), 1, 4)))::public.citext;
      else
        new.fan_alias := new.alias;
      end if;
    end if;
  end if;

  new.preferred_locale := coalesce(new.preferred_locale, 'en');
  return new;
end;
$$;

drop trigger if exists trg_users_workspace_identity_guard on app.users;
create trigger trg_users_workspace_identity_guard
  before insert or update on app.users
  for each row
  execute function app.users_workspace_identity_guard();

alter table app.users alter column fan_alias set not null;

grant select (fan_alias, preferred_workspace, preferred_locale) on app.users to mk_app;

-- 4. Controlled RPCs for updating fan alias and preferred workspace
create or replace function app.set_my_fan_alias(p_fan_alias text)
returns text
language plpgsql
volatile
security definer
set search_path = app, public, pg_temp
as $$
declare
  v_uid uuid := app.uid();
  v_clean text;
  v_role app.user_role;
  v_creator_name text;
  v_display_name text;
begin
  if v_uid is null or not app.is_active() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  v_clean := btrim(regexp_replace(coalesce(p_fan_alias, ''), '\s+', ' ', 'g'));
  if char_length(v_clean) < 2 or char_length(v_clean) > 40 then
    raise exception 'fan alias must be between 2 and 40 characters' using errcode = '23514';
  end if;
  if v_clean ~ '[\x00-\x1F\x7F<>@]' then
    raise exception 'fan alias contains invalid characters' using errcode = '23514';
  end if;
  if v_clean ~* '^diva(\s+|[:._·—–-]+|$)' then
    raise exception 'fan alias cannot use the Diva creator prefix' using errcode = '23514';
  end if;

  select u.role, c.creator_name, c.display_name
    into v_role, v_creator_name, v_display_name
    from app.users u
    left join app.creators c on c.user_id = u.id
   where u.id = v_uid;

  if v_role = 'creator' then
    if (v_creator_name is not null and lower(v_clean) = lower(v_creator_name))
       or (v_display_name is not null and lower(v_clean) = lower(v_display_name)) then
      raise exception 'fan alias must be distinct from your public creator identity' using errcode = '23514';
    end if;
  end if;

  if exists (
    select 1 from app.users x
     where x.id <> v_uid
       and (x.fan_alias = v_clean::public.citext or x.alias = v_clean::public.citext)
  ) then
    raise exception 'that fan alias is already taken' using errcode = '23505';
  end if;

  if v_role = 'member' then
    update app.users
       set fan_alias = v_clean::public.citext,
           alias = v_clean::public.citext,
           updated_at = now()
     where id = v_uid;
  else
    update app.users
       set fan_alias = v_clean::public.citext,
           updated_at = now()
     where id = v_uid;
  end if;

  insert into app.audit_log (actor_id, action, target_type, target_id, metadata)
  values (v_uid, 'account.fan_alias_update', 'user', v_uid::text, jsonb_build_object('fan_alias', v_clean));

  return v_clean;
end;
$$;

create or replace function app.set_my_workspace(p_workspace text)
returns text
language plpgsql
volatile
security definer
set search_path = app, pg_temp
as $$
declare
  v_uid uuid := app.uid();
  v_role app.user_role;
begin
  if v_uid is null or not app.is_active() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_workspace not in ('fan', 'studio') then
    raise exception 'invalid workspace' using errcode = '22023';
  end if;

  select role into v_role from app.users where id = v_uid;
  if p_workspace = 'studio' and v_role <> 'creator' then
    raise exception 'only approved creators may enter Creator Studio' using errcode = '42501';
  end if;

  update app.users
     set preferred_workspace = p_workspace,
         updated_at = now()
   where id = v_uid;

  return p_workspace;
end;
$$;

revoke all on function app.set_my_fan_alias(text), app.set_my_workspace(text) from public;
grant execute on function app.set_my_fan_alias(text), app.set_my_workspace(text) to mk_app;

-- 5. Update messaging & member listing functions so that when any account acts
--    as a fan (c.fan_id / s.fan_id), its fan_alias is shown to the creator,
--    never its public creator name or private email.
create or replace function app.my_conversation_peers()
returns table (conversation_id uuid, my_side text, peer_id uuid, peer_alias text)
language sql stable security definer set search_path = app, pg_temp as $$
  select c.id,
         case when c.fan_id = app.uid() then 'fan' else 'creator' end,
         case when c.fan_id = app.uid() then c.creator_id else c.fan_id end,
         case
           when c.fan_id = app.uid() then u.alias::text
           else coalesce(nullif(btrim(u.fan_alias::text), ''), u.alias::text)
         end
    from app.conversations c
    join app.users u on u.id = case when c.fan_id = app.uid() then c.creator_id else c.fan_id end
   where (c.fan_id = app.uid() or c.creator_id = app.uid()) and app.is_active()
$$;

create or replace function app.my_current_members()
returns table (fan_id uuid, alias text, tier_kind text, since timestamptz)
language sql stable security definer set search_path = app, pg_temp as $$
  select s.fan_id,
         coalesce(nullif(btrim(u.fan_alias::text), ''), u.alias::text) as alias,
         t.kind::text,
         s.created_at
    from app.subscriptions s
    join app.users u on u.id = s.fan_id and u.status = 'active'
    join app.tiers t on t.id = s.tier_id
   where s.creator_id = app.uid() and app.viewer_role() = 'creator'
     and s.status = 'active' and s.current_period_end > now()
     and not app.is_blocked_between(s.creator_id, s.fan_id)
$$;

create or replace function app.notify_message() returns trigger
language plpgsql security definer set search_path = app, pg_temp as $$
declare c app.conversations; recipient uuid; muted boolean; from_alias text;
begin
  if new.status <> 'sent' then return new; end if;
  select * into c from app.conversations where id = new.conversation_id;
  recipient := case when new.sender_id = c.fan_id then c.creator_id else c.fan_id end;
  muted := case when recipient = c.fan_id then c.fan_muted else c.creator_muted end;
  if muted then return new; end if;
  select case
    when new.sender_id = c.creator_id then
      coalesce((select app.format_creator_display_name(display_name) from app.creators where user_id = c.creator_id), 'Diva Creator')
    else coalesce(nullif(btrim(fan_alias::text), ''), alias::text)
  end
    into from_alias from app.users where id = new.sender_id;
  delete from app.notifications where user_id = recipient and kind = 'message.received' and read_at is null and data->>'conversation' = c.id::text;
  insert into app.notifications (user_id, kind, creator_id, data)
    values (
      recipient,
      'message.received',
      c.creator_id,
      jsonb_build_object(
        'conversation', c.id,
        'from', left(from_alias, 60),
        'sender_is_creator', (new.sender_id = c.creator_id)
      )
    );
  return new;
end $$;

revoke all on function app.my_conversation_peers(), app.my_current_members(), app.notify_message() from public;
grant execute on function app.my_conversation_peers(), app.my_current_members() to mk_app;

