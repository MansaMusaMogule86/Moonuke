-- =====================================================================
-- DivaFans · Creator allowlist and provisioned-creator activation
--
-- Only allowlisted email addresses may ever hold the creator role or a
-- creator invitation. Enforced here, for every database role (including
-- privileged server code), by guard triggers; the app checks first so it
-- can explain. The production list is exactly two addresses, normalised to
-- lower case. Test databases add fixture rows from the dev seed only
-- (source = 'test_fixture'); the app ignores those rows in production.
--
-- Provisioned creators are created by the owner's local provisioning
-- script with a temporary password they must replace at activation
-- (must_change_password), through a single-use, email-bound invitation.
-- =====================================================================

create table app.creator_allowlist (
  email    citext primary key check (email::text = lower(email::text) and email::text ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  source   text not null default 'production' check (source in ('production', 'test_fixture')),
  added_at timestamptz not null default now()
);
insert into app.creator_allowlist (email) values ('hjaouhari0@gmail.com'), ('mehdi.alaouiismaili9@gmail.com');

alter table app.creator_allowlist enable row level security;
revoke all on app.creator_allowlist from public;
grant select on app.creator_allowlist to mk_app;
create policy creator_allowlist_owner_read on app.creator_allowlist for select to mk_app using (app.is_owner());

-- Lookup for guards and policies (a plain subquery would be filtered by RLS).
-- Text in, text comparison: needs only built-in operators, whichever schema holds citext.
create function app.creator_email_allowed(p_email text) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select exists (select 1 from app.creator_allowlist where email::text = lower(btrim(p_email)))
$$;
revoke all on function app.creator_email_allowed(text) from public;
grant execute on function app.creator_email_allowed(text) to mk_app;

-- Guard triggers run as the caller (SECURITY INVOKER) and use the definer lookup.
create function app.users_creator_guard() returns trigger language plpgsql set search_path = app, pg_temp as $$
begin
  if new.role = 'creator'
     and (tg_op = 'INSERT' or old.role is distinct from 'creator' or old.email is distinct from new.email)
     and not app.creator_email_allowed(new.email::text) then
    raise exception 'The creator role is limited to allowlisted email addresses.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger users_creator_guard before insert or update of role, email on app.users
  for each row execute function app.users_creator_guard();

create function app.invitations_creator_guard() returns trigger language plpgsql set search_path = app, pg_temp as $$
begin
  if new.intended_role = 'creator' and (new.email is null or new.max_uses <> 1 or not app.creator_email_allowed(new.email::text)) then
    raise exception 'Creator invitations must be single-use and bound to an allowlisted email address.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger invitations_creator_guard before insert or update of intended_role, email, max_uses on app.invitations
  for each row execute function app.invitations_creator_guard();

-- Provisioned creators: temporary password until activation; attestation happens at activation.
alter table app.users add column must_change_password boolean not null default false;
alter table app.users alter column adult_attested_at drop not null;
alter table app.users add constraint users_adult_attested check (adult_attested_at is not null or must_change_password);

-- An activation invitation completes an existing provisioned account instead of creating one.
alter table app.invitations add column activates_user_id uuid references app.users(id) on delete cascade;
