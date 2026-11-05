-- Phase 8: reliability and performance hardening. Additive only.

-- Blast worker lease: a 'sending' Blast is re-claimable only after its lease
-- expires (crash recovery), so two workers never process it at once.
alter table app.blasts add column lease_until timestamptz;

-- Missing indexes for frequent lookups (fan-out, counts, segment resolution,
-- purchase checks, moderation joins).
create index if not exists follows_creator on app.follows (creator_id);
create index if not exists subscriptions_creator_status on app.subscriptions (creator_id, status, current_period_end);
create index if not exists subscriptions_tier on app.subscriptions (tier_id);
create index if not exists purchases_post on app.purchases (post_id);
create index if not exists messages_blast on app.messages (blast_id) where blast_id is not null;
create index if not exists reports_target on app.reports (target_id);
create index if not exists notifications_conversation on app.notifications ((data->>'conversation')) where kind = 'message.received' and read_at is null;
