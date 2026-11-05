-- =====================================================================
-- Phase 4 · White-glove creator onboarding, profile proposals,
-- social profile connections, AI-assist usage metering
-- Principles:
--  * The house may PREPARE a creator's profile, but only the creator can
--    ACCEPT it (consent) — proposals never write to app.creators directly.
--  * Concierge notes are owner-only; creators see a narrow status view.
--  * Social links are claims until the owner verifies ownership; creators
--    can never mark their own connection verified.
--  * AI usage is metered without storing prompts or outputs.
-- =====================================================================

create table app.onboarding_cases (
  id                    uuid primary key default gen_random_uuid(),
  invitation_id         uuid unique references app.invitations(id) on delete set null,
  user_id               uuid unique references app.users(id) on delete cascade,
  invitee_name          text not null check (char_length(invitee_name) between 1 and 80),
  invitee_email         citext not null check (char_length(invitee_email::text) between 3 and 254),
  status                text not null default 'active' check (status in ('active', 'completed', 'withdrawn')),
  concierge_notes       text check (char_length(concierge_notes) <= 4000),
  welcome_call_at       timestamptz,
  welcome_call_done_at  timestamptz,
  created_by            uuid not null references app.users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table app.profile_proposals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references app.users(id) on delete cascade,
  author_id   uuid references app.users(id) on delete set null,
  source      text not null check (source in ('house', 'assistant', 'creator')),
  fields      jsonb not null check (jsonb_typeof(fields) = 'object'),
  message     text check (char_length(message) <= 1000),
  status      text not null default 'proposed' check (status in ('proposed', 'accepted', 'declined', 'superseded')),
  ai_assisted boolean not null default false,
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);
create index profile_proposals_user on app.profile_proposals (user_id, created_at desc);
create unique index profile_proposals_one_open on app.profile_proposals (user_id) where status = 'proposed';

create table app.social_connections (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references app.users(id) on delete cascade,
  platform        text not null check (platform in ('instagram', 'tiktok', 'x', 'youtube', 'twitch', 'threads', 'website')),
  handle          text not null check (handle ~ '^[A-Za-z0-9._-]{1,60}$'),
  url             text not null check (url ~ '^https://[^\s/$.?#].[^\s]*$' and char_length(url) <= 300),
  proof_code      text not null check (proof_code ~ '^[a-z0-9-]{8,40}$'),
  status          text not null default 'unverified' check (status in ('unverified', 'verified', 'failed', 'revoked')),
  method          text not null default 'manual' check (method in ('manual', 'automated')),
  show_on_profile boolean not null default false,
  verified_at     timestamptz,
  verified_by     uuid references app.users(id),
  note            text check (char_length(note) <= 500),
  created_at      timestamptz not null default now(),
  unique (user_id, platform, handle)
);

create table app.ai_assist_usage (
  id            bigserial primary key,
  user_id       uuid not null references app.users(id) on delete cascade, -- whose profile
  actor_id      uuid not null references app.users(id) on delete cascade, -- who asked
  provider      text not null,
  model         text,
  input_chars   int not null default 0,
  output_chars  int not null default 0,
  blocked       boolean not null default false,
  created_at    timestamptz not null default now()
);

alter table app.onboarding_cases enable row level security;
alter table app.profile_proposals enable row level security;
alter table app.social_connections enable row level security;
alter table app.ai_assist_usage enable row level security;

-- ---------------------------------------------------------------- onboarding cases: owner only
grant select, insert, update on app.onboarding_cases to mk_app;
create policy cases_owner on app.onboarding_cases for all to mk_app using (app.is_owner()) with check (app.is_owner());

-- Creator-facing view of their own case (no concierge notes, no inviter).
create function app.my_onboarding_case() returns table (id uuid, status text, welcome_call_at timestamptz, welcome_call_done_at timestamptz, white_glove boolean)
language sql stable security definer set search_path = app, pg_temp as $$
  select c.id, c.status, c.welcome_call_at, c.welcome_call_done_at, true from app.onboarding_cases c where c.user_id = app.uid()
$$;
revoke all on function app.my_onboarding_case() from public;
grant execute on function app.my_onboarding_case() to mk_app;

-- ---------------------------------------------------------------- proposals
grant select, insert, update (status, decided_at) on app.profile_proposals to mk_app;
create policy proposals_select on app.profile_proposals for select to mk_app using (user_id = app.uid() or app.is_owner());
-- The house proposes for creators; creators may save their own assistant drafts.
create policy proposals_insert on app.profile_proposals for insert to mk_app with check (
  author_id = app.uid() and status = 'proposed' and (
    (app.is_owner() and source in ('house', 'assistant'))
    or (user_id = app.uid() and app.viewer_role() = 'creator' and source in ('assistant', 'creator'))
  )
);
-- Only the creator decides on their proposal; the owner may only withdraw (supersede) it.
create policy proposals_creator_decide on app.profile_proposals for update to mk_app
  using (user_id = app.uid() and status = 'proposed')
  with check (user_id = app.uid() and status in ('accepted', 'declined'));
create policy proposals_owner_supersede on app.profile_proposals for update to mk_app
  using (app.is_owner() and status = 'proposed')
  with check (app.is_owner() and status = 'superseded');

-- ---------------------------------------------------------------- social connections
grant select, insert, delete on app.social_connections to mk_app;
grant update (handle, url, show_on_profile, status, verified_at, verified_by, note, method) on app.social_connections to mk_app;
create policy socials_select on app.social_connections for select to mk_app using (
  user_id = app.uid() or app.is_owner()
  or (status = 'verified' and show_on_profile and app.can_see_creator(user_id))
);
create policy socials_insert on app.social_connections for insert to mk_app
  with check (user_id = app.uid() and app.viewer_role() = 'creator' and status = 'unverified' and verified_by is null);
create policy socials_self_update on app.social_connections for update to mk_app using (user_id = app.uid()) with check (user_id = app.uid());
create policy socials_owner_update on app.social_connections for update to mk_app using (app.is_owner()) with check (app.is_owner());
create policy socials_delete on app.social_connections for delete to mk_app using (user_id = app.uid() or app.is_owner());

-- Status may only be set by the owner (or the system role). Editing the
-- handle or URL of a verified connection drops it back to unverified.
-- SECURITY INVOKER on purpose (see creators_guard).
create function app.socials_guard() returns trigger language plpgsql set search_path = app, pg_temp as $$
begin
  if current_user <> 'mk_app' then return new; end if;
  if tg_op = 'UPDATE' and (new.handle is distinct from old.handle or new.url is distinct from old.url) then
    new.status := 'unverified'; new.verified_at := null; new.verified_by := null; new.show_on_profile := false;
    return new;
  end if;
  if (tg_op = 'UPDATE' and (new.status is distinct from old.status or new.verified_by is distinct from old.verified_by or new.method is distinct from old.method))
     and not app.is_owner() then
    raise exception 'only the owner can change verification status' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger socials_guard before update on app.social_connections for each row execute function app.socials_guard();

-- ---------------------------------------------------------------- AI usage metering (no content)
grant select, insert on app.ai_assist_usage to mk_app;
grant usage on sequence app.ai_assist_usage_id_seq to mk_app;
create policy ai_usage_insert on app.ai_assist_usage for insert to mk_app
  with check (actor_id = app.uid() and (user_id = app.uid() or app.is_owner()));
create policy ai_usage_select on app.ai_assist_usage for select to mk_app using (app.is_owner() or actor_id = app.uid());
