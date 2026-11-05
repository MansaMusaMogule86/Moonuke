-- Phase 8: provider-independent payment ledger and media upload pipeline.
-- INERT BY DEFAULT: nothing writes these tables unless FEATURE_PAYMENTS /
-- FEATURE_UPLOADS are on, which production refuses until providers are
-- approved. No real money moves; no real files are stored.

-- ================================================================ payments
create table app.payments (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('subscription', 'ppv', 'tip', 'paid_message')),
  fan_id          uuid not null references app.users(id),
  creator_id      uuid not null references app.users(id),
  target_id       uuid,                         -- tier, post or message, by kind
  amount_cents    int not null check (amount_cents > 0 and amount_cents <= 1000000),
  currency        char(3) not null check (currency ~ '^[A-Z]{3}$'),
  status          text not null default 'created'
                  check (status in ('created', 'pending', 'succeeded', 'failed', 'canceled', 'refunded', 'disputed', 'charged_back')),
  provider        text not null check (provider ~ '^[a-z0-9_-]{2,32}$'),
  provider_ref    text check (char_length(provider_ref) <= 200),
  idempotency_key text not null unique check (idempotency_key ~ '^[A-Za-z0-9_:-]{8,120}$'),
  fee_bps         int check (fee_bps between 0 and 10000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (provider, provider_ref),
  check (fan_id <> creator_id)
);
create index payments_creator on app.payments (creator_id, created_at desc);
create index payments_fan on app.payments (fan_id, created_at desc);

-- Every webhook event once (provider, event_id), for idempotency and audit.
create table app.payment_events (
  id             bigserial primary key,
  provider       text not null,
  event_id       text not null check (char_length(event_id) between 1 and 200),
  type           text not null check (char_length(type) <= 60),
  payment_id     uuid references app.payments(id),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  outcome        text not null default 'pending' check (outcome in ('pending', 'applied', 'ignored', 'rejected')),
  note           text check (char_length(note) <= 300),
  received_at    timestamptz not null default now(),
  unique (provider, event_id)
);

-- Double-entry ledger. Each transaction (txn_id) sums to zero; append-only.
create table app.ledger_entries (
  id           bigserial primary key,
  txn_id       uuid not null,
  payment_id   uuid references app.payments(id),
  account      text not null check (account ~ '^(provider_clearing|platform_fees|creator:[0-9a-f-]{36}|creator_hold:[0-9a-f-]{36}|payout_clearing)$'),
  amount_cents bigint not null check (amount_cents <> 0),
  currency     char(3) not null,
  memo         text not null check (char_length(memo) <= 120),
  created_at   timestamptz not null default now()
);
create index ledger_account on app.ledger_entries (account, currency);
create index ledger_txn on app.ledger_entries (txn_id);

create function app.ledger_balanced() returns trigger language plpgsql set search_path = app, pg_temp as $$
begin
  if exists (select 1 from app.ledger_entries where txn_id = new.txn_id group by txn_id, currency having sum(amount_cents) <> 0) then
    raise exception 'ledger transaction % does not balance', new.txn_id using errcode = '23514';
  end if;
  return null;
end $$;
create constraint trigger ledger_balanced after insert on app.ledger_entries
  deferrable initially deferred for each row execute function app.ledger_balanced();

create function app.ledger_append_only() returns trigger language plpgsql set search_path = app, pg_temp as $$
begin raise exception 'the ledger is append-only' using errcode = '42501'; end $$;
create trigger ledger_append_only before update or delete on app.ledger_entries for each row execute function app.ledger_append_only();

create table app.payouts (
  id           uuid primary key default gen_random_uuid(),
  creator_id   uuid not null references app.users(id),
  amount_cents bigint not null check (amount_cents > 0),
  currency     char(3) not null,
  status       text not null default 'requested' check (status in ('requested', 'approved', 'paid', 'failed', 'canceled')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- No mk_app grants: these tables are written only by the payment engine
-- (system role) and never read directly by viewers.
alter table app.payments enable row level security;
alter table app.payment_events enable row level security;
alter table app.ledger_entries enable row level security;
alter table app.payouts enable row level security;

-- A creator's own balances, aggregate only.
create function app.my_balances() returns table (currency char(3), available bigint, on_hold bigint)
language sql stable security definer set search_path = app, pg_temp as $$
  select l.currency,
         coalesce(sum(l.amount_cents) filter (where l.account = 'creator:' || app.uid()::text), 0)::bigint,
         coalesce(sum(l.amount_cents) filter (where l.account = 'creator_hold:' || app.uid()::text), 0)::bigint
    from app.ledger_entries l
   where l.account in ('creator:' || app.uid()::text, 'creator_hold:' || app.uid()::text) and app.viewer_role() = 'creator'
   group by l.currency
$$;
revoke all on function app.my_balances() from public;
grant execute on function app.my_balances() to mk_app;

-- ================================================================ media uploads
create table app.media_uploads (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references app.users(id) on delete cascade,
  purpose     text not null check (purpose in ('post', 'message', 'avatar')),
  status      text not null default 'pending'
              check (status in ('pending', 'uploaded', 'scanning', 'clean', 'quarantined', 'rejected', 'abandoned', 'deleted')),
  declared_mime text not null check (char_length(declared_mime) <= 100),
  sniffed_mime  text check (char_length(sniffed_mime) <= 100),
  size_bytes  bigint check (size_bytes >= 0),
  sha256      text check (sha256 ~ '^[0-9a-f]{64}$'),
  storage_key text unique check (storage_key ~ '^[a-z0-9/_-]{8,200}$'),
  reason      text check (char_length(reason) <= 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index media_uploads_owner on app.media_uploads (owner_id, created_at desc);
create index media_uploads_pending on app.media_uploads (created_at) where status in ('pending', 'uploaded', 'scanning');
alter table app.media_uploads enable row level security;
-- Owners see their own uploads' state; every state change goes through the
-- upload service (system role) after its own authorization checks.
grant select on app.media_uploads to mk_app;
create policy media_uploads_own on app.media_uploads for select to mk_app using (owner_id = app.uid());
