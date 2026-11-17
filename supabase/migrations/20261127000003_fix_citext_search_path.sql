-- Forward fix for environments that already applied
-- 20261126000001_workspace_and_identity_separation.sql before its
-- search_path correction: SECURITY DEFINER functions pinned to
-- `app, pg_temp` cannot resolve the `citext` extension type (which lives
-- in `public`), so fan-alias updates failed with
-- `type "citext" does not exist`.
-- This migration re-applies the two affected functions with `public`
-- in the pinned search_path and schema-qualified casts. It is safe to
-- run on fresh installs too (create or replace is idempotent, and the
-- history file carries the same definitions).
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
