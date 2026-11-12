-- Phase 12: creator referral links — fan registration attributed to a creator.
--
-- A creator has one stable public link (/join/<handle>). When the owner turns on
-- FEATURE_CREATOR_REFERRALS, that link may create a FAN account (never a
-- creator). This table records the attribution so the creator can see how many
-- fans joined through their link — a count only, never fan identities.
--
-- Writes happen only through the server (system role); mk_app has no grants on
-- the table, and reads are limited to the aggregate count helper below.

create table app.creator_referrals (
  id         uuid primary key default gen_random_uuid(),
  creator_id uuid not null references app.users(id),
  user_id    uuid not null unique references app.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index creator_referrals_creator on app.creator_referrals (creator_id, created_at desc);
alter table app.creator_referrals enable row level security;

-- The creator's own referral count. Aggregate only; never a fan identity.
create function app.my_referral_count() returns int
language sql stable security definer set search_path = app, pg_temp as $$
  select count(*)::int from app.creator_referrals r
   where r.creator_id = app.uid() and app.viewer_role() = 'creator'
$$;
revoke all on function app.my_referral_count() from public;
grant execute on function app.my_referral_count() to mk_app;
