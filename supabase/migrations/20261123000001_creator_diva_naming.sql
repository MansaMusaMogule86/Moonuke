-- =====================================================================
-- DivaFans · Mandatory "Diva [chosen name]" Creator Naming
--
-- 1. Every creator profile stores the editable name portion (`creator_name`)
--    separately from the fixed "Diva" prefix and formats `display_name` as
--    `'Diva ' || creator_name`.
-- 2. Leading "Diva" prefixes are stripped idempotently so entering
--    "Diva Miriam" produces "Diva Miriam", never "Diva Diva Miriam".
-- 3. Supports Unicode names (including Arabic) across `app.creators` and
--    `app.users.alias`.
-- 4. Safe, idempotent backfill for existing creator rows; never derives
--    public names from email addresses.
-- =====================================================================

-- 1. Relax app.users.alias check constraint to support Unicode scripts
--    (including Arabic) and "Diva [name]" lengths up to 60 characters,
--    while rejecting control characters, HTML brackets, and '@' emails.
alter table app.users drop constraint if exists users_alias_check;
alter table app.users add constraint users_alias_check check (
  char_length(alias::text) between 2 and 60
  and alias::text = btrim(alias::text)
  and alias::text !~ '[\x00-\x1F\x7F<>@]'
  and alias::text ~ '^[^\s._''-](.*[^\s._''-])?$'
);

-- 2. Shared SQL normalization and formatting functions for creator names
create or replace function app.normalize_creator_name(p_raw text)
returns text
language plpgsql
immutable
set search_path = app, pg_temp
as $$
declare
  v_s text;
begin
  if p_raw is null then
    return '';
  end if;
  -- Strip control/invisible formatting characters and collapse whitespace
  v_s := regexp_replace(p_raw, '[\x00-\x1F\x7F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]', '', 'g');
  v_s := btrim(regexp_replace(v_s, '\s+', ' ', 'g'));

  -- Strip any leading "Diva" prefix(es) case-insensitively
  while v_s ~* '^diva(\s+|[:._·—–-]+|$)' loop
    v_s := btrim(regexp_replace(v_s, '^diva(\s+|[:._·—–-]+|$)', '', 'i'));
  end loop;

  return v_s;
end;
$$;

create or replace function app.format_creator_display_name(p_raw text)
returns text
language plpgsql
immutable
set search_path = app, pg_temp
as $$
declare
  v_chosen text;
begin
  v_chosen := app.normalize_creator_name(p_raw);
  if v_chosen is null or v_chosen = '' or position('@' in v_chosen) > 0 then
    return 'Diva Creator';
  end if;
  v_chosen := btrim(left(v_chosen, 50));
  if v_chosen = '' then
    return 'Diva Creator';
  end if;
  return 'Diva ' || v_chosen;
end;
$$;

revoke all on function app.normalize_creator_name(text), app.format_creator_display_name(text) from public;
grant execute on function app.normalize_creator_name(text), app.format_creator_display_name(text) to mk_app;

-- 3. Add creator_name and needs_name_setup columns to app.creators (idempotent)
alter table app.creators
  add column if not exists creator_name text,
  add column if not exists needs_name_setup boolean not null default false;

-- 4. Safe, idempotent backfill for existing creator profiles.
--    Never derives public names from private email addresses.
--    If a creator row has no suitable public name, assigns the neutral
--    temporary label "Diva Creator" and sets needs_name_setup = true.
update app.creators c
set
  needs_name_setup = case
    when app.normalize_creator_name(coalesce(nullif(btrim(c.creator_name), ''), c.display_name)) = ''
      or position('@' in coalesce(nullif(btrim(c.creator_name), ''), c.display_name)) > 0
      or (c.needs_name_setup and app.normalize_creator_name(coalesce(nullif(btrim(c.creator_name), ''), c.display_name)) = 'Creator')
    then true
    else false
  end,
  creator_name = case
    when app.normalize_creator_name(coalesce(nullif(btrim(c.creator_name), ''), c.display_name)) = ''
      or position('@' in coalesce(nullif(btrim(c.creator_name), ''), c.display_name)) > 0
    then 'Creator'
    else btrim(left(app.normalize_creator_name(coalesce(nullif(btrim(c.creator_name), ''), c.display_name)), 50))
  end,
  display_name = app.format_creator_display_name(coalesce(nullif(btrim(c.creator_name), ''), c.display_name));

-- 5. Update app.creators_guard() (SECURITY INVOKER) to enforce both owner-only
--    publication/featuring AND mandatory "Diva [chosen name]" normalization.
create or replace function app.creators_guard()
returns trigger
language plpgsql
set search_path = app, pg_temp
as $$
declare
  v_raw text;
  v_chosen text;
begin
  -- Preserve owner-only publication/featuring checks when running as mk_app
  if current_user = 'mk_app' then
    if tg_op = 'INSERT' then
      if (new.published_at is not null or new.featured) and not app.is_owner() then
        raise exception 'only the owner can publish or feature a creator' using errcode = '42501';
      end if;
    elsif (new.published_at is distinct from old.published_at or new.featured is distinct from old.featured
           or new.user_id is distinct from old.user_id) and not app.is_owner() then
      raise exception 'only the owner can publish or feature a creator' using errcode = '42501';
    end if;
  end if;

  -- Determine which name field was supplied or updated
  if tg_op = 'INSERT' then
    v_raw := coalesce(nullif(btrim(new.creator_name), ''), new.display_name);
  else
    if new.creator_name is distinct from old.creator_name and nullif(btrim(new.creator_name), '') is not null then
      v_raw := new.creator_name;
    elsif new.display_name is distinct from old.display_name then
      v_raw := new.display_name;
    else
      v_raw := coalesce(nullif(btrim(new.creator_name), ''), new.display_name);
    end if;
  end if;

  if v_raw is not null and v_raw ~ '[\x00-\x1F\x7F<>@]' then
    raise exception 'creator name contains invalid characters' using errcode = '23514';
  end if;

  v_chosen := app.normalize_creator_name(v_raw);

  if v_chosen = '' then
    if coalesce(new.needs_name_setup, false) then
      v_chosen := 'Creator';
    else
      raise exception 'creator name cannot be blank' using errcode = '23514';
    end if;
  end if;

  if char_length(v_chosen) > 50 then
    raise exception 'creator name exceeds maximum length of 50 characters' using errcode = '23514';
  end if;

  new.creator_name := v_chosen;
  new.display_name := 'Diva ' || v_chosen;
  new.needs_name_setup := coalesce(new.needs_name_setup, false);

  return new;
end;
$$;

-- 6. Enforce NOT NULL and structural CHECK constraints on app.creators
alter table app.creators alter column creator_name set not null;
alter table app.creators drop constraint if exists creators_diva_name_check;
alter table app.creators add constraint creators_diva_name_check check (
  char_length(creator_name) between 1 and 50
  and creator_name !~ '[\x00-\x1F\x7F<>@]'
  and display_name = ('Diva ' || creator_name)
  and display_name !~* '^Diva\s+Diva(\s|$)'
);

grant insert (creator_name, needs_name_setup) on app.creators to mk_app;
grant update (creator_name, needs_name_setup) on app.creators to mk_app;

-- 7. Ensure message notifications always record formatted creator names
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
    else alias::text
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
revoke all on function app.notify_message() from public;

