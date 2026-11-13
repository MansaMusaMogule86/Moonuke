-- =====================================================================
-- DivaFans · Phase 13 · Two-Owner Identity, Governance & 50/50 Financials
--
-- Implements the approved two-owner management and financial architecture:
--   OWNER_001: Jade       (50% = 5000 bps, Account A) -> c570c63a-c9d8-44fc-b47b-165aed89d764
--   OWNER_002: Kael Veyre (50% = 5000 bps, Account B) -> aa44892b-67d1-4c22-93d0-371a61e51caa
--
-- Preserves the existing authentication system, RLS posture, Creator Studio,
-- Fan Platform, and double-entry payment ledger. Live transfers remain disabled.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Replace single-owner index with verified multi-owner guard
-- ---------------------------------------------------------------------
drop index if exists app.users_single_owner;

create or replace function app.owner_user_allowed(p_user_id uuid, p_email text) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select p_user_id in (
           'c570c63a-c9d8-44fc-b47b-165aed89d764'::uuid,
           'aa44892b-67d1-4c22-93d0-371a61e51caa'::uuid
         )
      or lower(btrim(coalesce(p_email, ''))) = 'owner@divafans.test'
$$;
revoke all on function app.owner_user_allowed(uuid, text) from public;
grant execute on function app.owner_user_allowed(uuid, text) to mk_app;

create or replace function app.user_has_creator_profile(p_user_id uuid) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select exists (select 1 from app.creators where user_id = p_user_id)
$$;
revoke all on function app.user_has_creator_profile(uuid) from public;
grant execute on function app.user_has_creator_profile(uuid) to mk_app;

-- Guard trigger (SECURITY INVOKER per schema lint rules)
create or replace function app.users_owner_guard() returns trigger
language plpgsql set search_path = app, pg_temp as $$
begin
  if new.role = 'owner' then
    if app.user_has_creator_profile(new.id) then
      raise exception 'A creator account cannot receive owner permissions.' using errcode = '42501';
    end if;
    if not app.owner_user_allowed(new.id, new.email::text) then
      raise exception 'Only verified platform owner accounts may hold the owner role.' using errcode = '23505';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists users_owner_guard on app.users;
create trigger users_owner_guard before insert or update of role, email on app.users
  for each row execute function app.users_owner_guard();

-- ---------------------------------------------------------------------
-- 2. Platform Owners Registry (app.platform_owners)
-- ---------------------------------------------------------------------
create table app.platform_owners (
  id           text primary key check (id in ('OWNER_001', 'OWNER_002')),
  auth_user_id uuid not null unique references app.users(id) on delete restrict,
  display_name text not null unique check (display_name in ('Jade', 'Kael Veyre')),
  status       text not null default 'active' check (status in ('active', 'suspended', 'retired')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (
    (id = 'OWNER_001' and display_name = 'Jade') or
    (id = 'OWNER_002' and display_name = 'Kael Veyre')
  )
);

create or replace function app.user_is_enrolled_owner(p_user_id uuid) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select exists (select 1 from app.platform_owners where auth_user_id = p_user_id)
$$;
revoke all on function app.user_is_enrolled_owner(uuid) from public;
grant execute on function app.user_is_enrolled_owner(uuid) to mk_app;

create or replace function app.check_owner_enrollment_target(p_owner_id text, p_user_id uuid) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select (
    (p_owner_id = 'OWNER_001' and p_user_id = 'c570c63a-c9d8-44fc-b47b-165aed89d764'::uuid) or
    (p_owner_id = 'OWNER_002' and p_user_id = 'aa44892b-67d1-4c22-93d0-371a61e51caa'::uuid)
  )
  and exists (
    select 1 from app.users u
     where u.id = p_user_id
       and u.role = 'owner'
       and u.status = 'active'
  )
  and not exists (
    select 1 from app.creators c where c.user_id = p_user_id
  )
$$;
revoke all on function app.check_owner_enrollment_target(text, uuid) from public;
grant execute on function app.check_owner_enrollment_target(text, uuid) to mk_app;

create or replace function app.platform_owners_guard() returns trigger
language plpgsql set search_path = app, pg_temp as $$
begin
  if not app.check_owner_enrollment_target(new.id, new.auth_user_id) then
    raise exception 'Owner enrollment requires a verified active owner account without creator privileges.' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger platform_owners_guard before insert or update on app.platform_owners
  for each row execute function app.platform_owners_guard();

-- Prevent enrolled owners from being turned into creators or downgraded
create or replace function app.users_enrolled_owner_guard() returns trigger
language plpgsql set search_path = app, pg_temp as $$
begin
  if app.user_is_enrolled_owner(old.id) and new.role <> 'owner' then
    raise exception 'Enrolled platform owners cannot be reassigned to another role.' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger users_enrolled_owner_guard before update of role on app.users
  for each row execute function app.users_enrolled_owner_guard();

create or replace function app.creators_owner_separation_guard() returns trigger
language plpgsql set search_path = app, pg_temp as $$
begin
  if app.user_is_enrolled_owner(new.user_id) then
    raise exception 'Platform owners cannot create or hold creator profiles.' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger creators_owner_separation_guard before insert or update on app.creators
  for each row execute function app.creators_owner_separation_guard();

-- Helper resolving the authenticated owner ID strictly from app.uid() at AAL2
create or replace function app.current_owner_id() returns text
language sql stable security definer set search_path = app, pg_temp as $$
  select po.id
    from app.platform_owners po
    join app.users u on u.id = po.auth_user_id
   where po.auth_user_id = app.uid()
     and po.status = 'active'
     and u.status = 'active'
     and u.role = 'owner'
     and coalesce(current_setting('app.aal', true), '1') = '2'
$$;
revoke all on function app.current_owner_id() from public;
grant execute on function app.current_owner_id() to mk_app;

-- ---------------------------------------------------------------------
-- 3. Ownership Allocations (app.ownership_allocations)
-- ---------------------------------------------------------------------
create table app.ownership_allocations (
  id                      uuid primary key default gen_random_uuid(),
  owner_id                text not null references app.platform_owners(id) on delete restrict,
  percentage_basis_points int not null check (percentage_basis_points = 5000),
  effective_from          timestamptz not null default now(),
  effective_to            timestamptz check (effective_to is null or effective_to > effective_from),
  approval_reference      text not null check (char_length(approval_reference) between 3 and 200),
  created_at              timestamptz not null default now()
);

-- Prevent multiple open-ended active allocations for the same owner
create unique index ownership_allocations_one_active
  on app.ownership_allocations (owner_id) where effective_to is null;

create index ownership_allocations_owner_effective
  on app.ownership_allocations (owner_id, effective_from desc);

-- Prevent overlapping allocation intervals for the same owner
create or replace function app.ownership_allocations_overlap_check() returns trigger
language plpgsql set search_path = app, pg_temp as $$
begin
  if exists (
    select 1 from app.ownership_allocations a
     where a.owner_id = new.owner_id
       and a.id is distinct from new.id
       and tstzrange(a.effective_from, coalesce(a.effective_to, 'infinity'::timestamptz), '[)')
           && tstzrange(new.effective_from, coalesce(new.effective_to, 'infinity'::timestamptz), '[)')
  ) then
    raise exception 'Overlapping ownership allocation periods are not permitted.' using errcode = '23505';
  end if;
  return new;
end $$;

create trigger ownership_allocations_no_overlap before insert or update on app.ownership_allocations
  for each row execute function app.ownership_allocations_overlap_check();

-- Deferred constraint trigger: active ownership registry must total 10000 bps (100%) across 2 active owners
create or replace function app.ownership_registry_invariant() returns trigger
language plpgsql set search_path = app, pg_temp as $$
declare
  v_owners int;
  v_active_allocs int;
  v_total_bps int;
begin
  select count(*)::int into v_owners from app.platform_owners where status = 'active';
  if v_owners = 0 then
    return null;
  end if;
  if v_owners <> 2 then
    raise exception 'Ownership registry must contain exactly 2 active owners (found %).', v_owners using errcode = '23514';
  end if;
  select count(*)::int, coalesce(sum(a.percentage_basis_points), 0)::int
    into v_active_allocs, v_total_bps
    from app.ownership_allocations a
    join app.platform_owners o on o.id = a.owner_id
   where o.status = 'active'
     and a.effective_to is null;
  if v_active_allocs <> 2 or v_total_bps <> 10000 then
    raise exception 'Active ownership allocations must total 10000 basis points across 2 active owners (found % owners, % bps).', v_active_allocs, v_total_bps using errcode = '23514';
  end if;
  return null;
end $$;

create constraint trigger ownership_allocations_total_10000
  after insert or update or delete on app.ownership_allocations
  deferrable initially deferred
  for each row execute function app.ownership_registry_invariant();

create constraint trigger platform_owners_total_10000
  after insert or update or delete on app.platform_owners
  deferrable initially deferred
  for each row execute function app.ownership_registry_invariant();

-- ---------------------------------------------------------------------
-- 4. Separate Payout Destinations (app.payout_destinations)
-- ---------------------------------------------------------------------
create table app.payout_destinations (
  id                         uuid primary key default gen_random_uuid(),
  owner_id                   text not null references app.platform_owners(id) on delete restrict,
  account_label              text not null check (account_label in ('Account A', 'Account B')),
  provider                   text not null check (provider ~ '^[a-z0-9_-]{2,40}$'),
  provider_account_reference text not null check (
    char_length(provider_account_reference) between 4 and 160
    and provider_account_reference !~ '(?i)(private[ _-]?key|secret|mnemonic|seed[ _-]?phrase)'
    and provider_account_reference !~ '^[0-9]{12,19}$'
  ),
  masked_details             text not null check (char_length(masked_details) between 4 and 80),
  destination_type           text not null check (destination_type in ('bank_account', 'settlement_wallet', 'custodial_account', 'wire_beneficiary')),
  currency                   char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  verification_status        text not null default 'pending' check (verification_status in ('pending', 'verified', 'suspended', 'rejected')),
  status                     text not null default 'active' check (status in ('active', 'archived', 'disabled')),
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  check (
    (owner_id = 'OWNER_001' and account_label = 'Account A') or
    (owner_id = 'OWNER_002' and account_label = 'Account B')
  )
);

create unique index payout_destinations_one_active
  on app.payout_destinations (owner_id) where status = 'active';

create index payout_destinations_owner on app.payout_destinations (owner_id, created_at desc);

-- ---------------------------------------------------------------------
-- 5. Financial Distribution Periods & Waterfall Entities
-- ---------------------------------------------------------------------
create table app.financial_distribution_periods (
  id                        uuid primary key default gen_random_uuid(),
  period_start              timestamptz not null,
  period_end                timestamptz not null check (period_end > period_start),
  currency                  char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  gross_collections_minor   bigint not null default 0 check (gross_collections_minor >= 0),
  refunds_chargebacks_minor bigint not null default 0 check (refunds_chargebacks_minor >= 0),
  taxes_minor               bigint not null default 0 check (taxes_minor >= 0),
  creator_liabilities_minor bigint not null default 0 check (creator_liabilities_minor >= 0),
  platform_revenue_minor    bigint not null default 0 check (platform_revenue_minor >= 0),
  processing_costs_minor    bigint not null default 0 check (processing_costs_minor >= 0),
  operating_expenses_minor  bigint not null default 0 check (operating_expenses_minor >= 0),
  reserves_minor            bigint not null default 0 check (reserves_minor >= 0),
  deductions_minor          bigint not null default 0 check (deductions_minor >= 0),
  distributable_amount_minor bigint not null default 0 check (distributable_amount_minor >= 0),
  reconciliation_exceptions int not null default 0 check (reconciliation_exceptions >= 0),
  calculation_version       int not null default 1 check (calculation_version >= 1),
  status                    text not null default 'DRAFT' check (status in (
                              'DRAFT',
                              'CALCULATED',
                              'RECONCILED',
                              'AWAITING_APPROVAL',
                              'PARTIALLY_APPROVED',
                              'APPROVED',
                              'READY_FOR_PAYOUT',
                              'SIMULATED',
                              'ON_HOLD',
                              'REJECTED',
                              'FAILED',
                              'PAID'
                            )),
  finalized_at              timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (period_start, period_end, currency)
);

create index financial_periods_status on app.financial_distribution_periods (status, period_end desc);

-- Live settlement guard: PAID is reserved for future verified live settlement
create or replace function app.financial_periods_live_settlement_guard() returns trigger
language plpgsql set search_path = app, pg_temp as $$
begin
  if new.status = 'PAID' then
    raise exception 'Live settlement transfers are disabled; PAID status is reserved for future verified provider integration.' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger financial_periods_live_settlement_guard
  before insert or update on app.financial_distribution_periods
  for each row execute function app.financial_periods_live_settlement_guard();

create table app.platform_operating_expenses (
  id           uuid primary key default gen_random_uuid(),
  period_id    uuid references app.financial_distribution_periods(id) on delete set null,
  category     text not null check (category in ('processing_fee', 'settlement_cost', 'tax', 'infrastructure', 'compliance', 'legal', 'other')),
  description  text not null check (char_length(description) between 2 and 200),
  amount_minor bigint not null check (amount_minor >= 0),
  currency     char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  status       text not null default 'approved' check (status in ('pending', 'approved', 'rejected')),
  approved_by  uuid references app.users(id),
  incurred_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index operating_expenses_period on app.platform_operating_expenses (period_id, incurred_at desc);

create table app.platform_reserves (
  id           uuid primary key default gen_random_uuid(),
  period_id    uuid references app.financial_distribution_periods(id) on delete set null,
  reason       text not null check (char_length(reason) between 2 and 200),
  amount_minor bigint not null check (amount_minor >= 0),
  currency     char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  status       text not null default 'active' check (status in ('active', 'released')),
  created_at   timestamptz not null default now(),
  released_at  timestamptz
);
create index platform_reserves_period on app.platform_reserves (period_id, status);

create table app.currency_conversion_records (
  id                uuid primary key default gen_random_uuid(),
  from_currency     char(3) not null check (from_currency ~ '^[A-Z]{3}$'),
  to_currency       char(3) not null check (to_currency ~ '^[A-Z]{3}$'),
  from_amount_minor bigint not null check (from_amount_minor >= 0),
  to_amount_minor   bigint not null check (to_amount_minor >= 0),
  rate_numerator    bigint not null check (rate_numerator > 0),
  rate_denominator  bigint not null check (rate_denominator > 0),
  reference         text not null check (char_length(reference) between 2 and 120),
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. Owner Distribution Allocations (app.owner_distribution_allocations)
-- ---------------------------------------------------------------------
create table app.owner_distribution_allocations (
  id                               uuid primary key default gen_random_uuid(),
  distribution_period_id           uuid not null references app.financial_distribution_periods(id) on delete cascade,
  owner_id                         text not null references app.platform_owners(id) on delete restrict,
  percentage_snapshot_basis_points int not null check (percentage_snapshot_basis_points = 5000),
  allocated_amount_minor           bigint not null check (allocated_amount_minor >= 0),
  status                           text not null default 'PENDING' check (status in (
                                     'PENDING',
                                     'APPROVED',
                                     'READY_FOR_PAYOUT',
                                     'SIMULATED',
                                     'ON_HOLD',
                                     'REJECTED',
                                     'FAILED',
                                     'PAID'
                                   )),
  created_at                       timestamptz not null default now(),
  updated_at                       timestamptz not null default now(),
  unique (distribution_period_id, owner_id)
);

create index owner_allocations_owner on app.owner_distribution_allocations (owner_id, created_at desc);

-- ---------------------------------------------------------------------
-- 7. Dual-Owner Distribution Approvals (app.distribution_approvals)
-- ---------------------------------------------------------------------
create table app.distribution_approvals (
  id                     uuid primary key default gen_random_uuid(),
  distribution_period_id uuid not null references app.financial_distribution_periods(id) on delete restrict,
  owner_id               text not null references app.platform_owners(id) on delete restrict,
  authenticated_actor_id uuid not null references app.users(id) on delete restrict,
  calculation_version    int not null check (calculation_version >= 1),
  decision               text not null check (decision in ('APPROVED', 'REJECTED')),
  note                   text check (char_length(note) <= 500),
  approved_at            timestamptz not null default now(),
  unique (distribution_period_id, owner_id, calculation_version)
);

create index distribution_approvals_period on app.distribution_approvals (distribution_period_id, calculation_version);

create or replace function app.owner_matches_actor(p_owner_id text, p_actor_id uuid) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select exists (
    select 1 from app.platform_owners po
      join app.users u on u.id = po.auth_user_id
     where po.id = p_owner_id
       and po.auth_user_id = p_actor_id
       and po.status = 'active'
       and u.status = 'active'
       and u.role = 'owner'
  )
$$;
revoke all on function app.owner_matches_actor(text, uuid) from public;
grant execute on function app.owner_matches_actor(text, uuid) to mk_app;

create or replace function app.distribution_approvals_guard() returns trigger
language plpgsql set search_path = app, pg_temp as $$
begin
  if not app.owner_matches_actor(new.owner_id, new.authenticated_actor_id) then
    raise exception 'An owner may only record a distribution decision using their own authenticated account.' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger distribution_approvals_guard before insert on app.distribution_approvals
  for each row execute function app.distribution_approvals_guard();

-- Approval history is strictly immutable (append-only)
create trigger distribution_approvals_no_update before update or delete on app.distribution_approvals
  for each row execute function app.audit_immutable();
create trigger distribution_approvals_no_truncate before truncate on app.distribution_approvals
  for each statement execute function app.audit_immutable();

-- ---------------------------------------------------------------------
-- 8. Owner Payouts (app.owner_payouts)
-- ---------------------------------------------------------------------
create table app.owner_payouts (
  id                         uuid primary key default gen_random_uuid(),
  owner_id                   text not null references app.platform_owners(id) on delete restrict,
  distribution_allocation_id uuid not null references app.owner_distribution_allocations(id) on delete restrict,
  payout_destination_id      uuid not null references app.payout_destinations(id) on delete restrict,
  amount_minor               bigint not null check (amount_minor >= 0),
  currency                   char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  status                     text not null default 'SIMULATED' check (status in (
                               'READY_FOR_PAYOUT',
                               'SIMULATED',
                               'ON_HOLD',
                               'FAILED',
                               'PAID'
                             )),
  provider_reference         text not null unique check (char_length(provider_reference) between 4 and 160),
  idempotency_key            text not null unique check (idempotency_key ~ '^[A-Za-z0-9_:-]{8,140}$'),
  statement_json             jsonb not null default '{}'::jsonb,
  failure_reason             text check (char_length(failure_reason) <= 300),
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

-- Prevent duplicate active payouts for the same distribution allocation
create unique index owner_payouts_one_active_per_allocation
  on app.owner_payouts (distribution_allocation_id)
  where status in ('READY_FOR_PAYOUT', 'SIMULATED', 'PAID');

create index owner_payouts_owner on app.owner_payouts (owner_id, created_at desc);

create or replace function app.verify_payout_integrity(
  p_owner_id text,
  p_allocation_id uuid,
  p_destination_id uuid,
  p_amount_minor bigint
) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select exists (
    select 1
      from app.owner_distribution_allocations a
      join app.financial_distribution_periods p on p.id = a.distribution_period_id
      join app.payout_destinations d on d.id = p_destination_id
     where a.id = p_allocation_id
       and a.owner_id = p_owner_id
       and d.owner_id = p_owner_id
       and d.status = 'active'
       and d.verification_status = 'verified'
       and a.allocated_amount_minor = p_amount_minor
       -- Both OWNER_001 and OWNER_002 must have approved the current calculation_version
       and exists (
         select 1 from app.distribution_approvals ap1
          where ap1.distribution_period_id = p.id
            and ap1.owner_id = 'OWNER_001'
            and ap1.calculation_version = p.calculation_version
            and ap1.decision = 'APPROVED'
       )
       and exists (
         select 1 from app.distribution_approvals ap2
          where ap2.distribution_period_id = p.id
            and ap2.owner_id = 'OWNER_002'
            and ap2.calculation_version = p.calculation_version
            and ap2.decision = 'APPROVED'
       )
  )
$$;
revoke all on function app.verify_payout_integrity(text, uuid, uuid, bigint) from public;
grant execute on function app.verify_payout_integrity(text, uuid, uuid, bigint) to mk_app;

create or replace function app.owner_payouts_guard() returns trigger
language plpgsql set search_path = app, pg_temp as $$
begin
  if new.status = 'PAID' then
    raise exception 'Live payout execution is disabled; only simulated payouts are permitted.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.owner_id <> old.owner_id or new.payout_destination_id <> old.payout_destination_id or new.distribution_allocation_id <> old.distribution_allocation_id) then
    raise exception 'Payout owner, allocation, and destination cannot be redirected.' using errcode = '42501';
  end if;
  if not app.verify_payout_integrity(new.owner_id, new.distribution_allocation_id, new.payout_destination_id, new.amount_minor) then
    raise exception 'Payout failed integrity check: destination and allocation must belong to the same owner and require dual-owner approval.' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger owner_payouts_guard before insert or update on app.owner_payouts
  for each row execute function app.owner_payouts_guard();

-- ---------------------------------------------------------------------
-- 9. Financial Audit Events (app.financial_audit_events)
-- ---------------------------------------------------------------------
create table app.financial_audit_events (
  id            bigserial primary key,
  actor_id      uuid references app.users(id) on delete restrict,
  owner_id      text references app.platform_owners(id) on delete restrict,
  event_type    text not null check (event_type ~ '^[a-z0-9_]+\.[a-z0-9_]+$'),
  resource_type text not null check (char_length(resource_type) between 2 and 80),
  resource_id   text not null check (char_length(resource_id) between 1 and 120),
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index financial_audit_events_created on app.financial_audit_events (created_at desc, id desc);
create index financial_audit_events_owner on app.financial_audit_events (owner_id, created_at desc);

create trigger financial_audit_events_no_update before update or delete on app.financial_audit_events
  for each row execute function app.audit_immutable();
create trigger financial_audit_events_no_truncate before truncate on app.financial_audit_events
  for each statement execute function app.audit_immutable();

-- ---------------------------------------------------------------------
-- 10. Row-Level Security & Least-Privilege Grants
-- ---------------------------------------------------------------------
alter table app.platform_owners                enable row level security;
alter table app.ownership_allocations          enable row level security;
alter table app.payout_destinations            enable row level security;
alter table app.financial_distribution_periods enable row level security;
alter table app.platform_operating_expenses    enable row level security;
alter table app.platform_reserves              enable row level security;
alter table app.currency_conversion_records    enable row level security;
alter table app.owner_distribution_allocations enable row level security;
alter table app.distribution_approvals         enable row level security;
alter table app.owner_payouts                  enable row level security;
alter table app.financial_audit_events         enable row level security;

revoke all on
  app.platform_owners,
  app.ownership_allocations,
  app.payout_destinations,
  app.financial_distribution_periods,
  app.platform_operating_expenses,
  app.platform_reserves,
  app.currency_conversion_records,
  app.owner_distribution_allocations,
  app.distribution_approvals,
  app.owner_payouts,
  app.financial_audit_events
from public;

revoke all on sequence app.financial_audit_events_id_seq from public;

grant select on
  app.platform_owners,
  app.ownership_allocations,
  app.payout_destinations,
  app.financial_distribution_periods,
  app.platform_operating_expenses,
  app.platform_reserves,
  app.currency_conversion_records,
  app.owner_distribution_allocations,
  app.distribution_approvals,
  app.owner_payouts,
  app.financial_audit_events
to mk_app;

-- Shared ownership and ledger tables: readable only by an active enrolled owner at AAL2
create policy platform_owners_select on app.platform_owners
  for select to mk_app using (app.current_owner_id() is not null);

create policy ownership_allocations_select on app.ownership_allocations
  for select to mk_app using (app.current_owner_id() is not null);

create policy financial_periods_select on app.financial_distribution_periods
  for select to mk_app using (app.current_owner_id() is not null);

create policy operating_expenses_select on app.platform_operating_expenses
  for select to mk_app using (app.current_owner_id() is not null);

create policy platform_reserves_select on app.platform_reserves
  for select to mk_app using (app.current_owner_id() is not null);

create policy currency_conversions_select on app.currency_conversion_records
  for select to mk_app using (app.current_owner_id() is not null);

create policy owner_allocations_select on app.owner_distribution_allocations
  for select to mk_app using (app.current_owner_id() is not null);

create policy distribution_approvals_select on app.distribution_approvals
  for select to mk_app using (app.current_owner_id() is not null);

-- Strictly owner-private tables: each owner can ONLY read their own payout destinations & payouts
create policy payout_destinations_own_select on app.payout_destinations
  for select to mk_app using (owner_id = app.current_owner_id());

create policy owner_payouts_own_select on app.owner_payouts
  for select to mk_app using (owner_id = app.current_owner_id());

-- Financial audit events: shared events (owner_id is null) or the caller's own owner_id
create policy financial_audit_events_select on app.financial_audit_events
  for select to mk_app using (
    app.current_owner_id() is not null
    and (owner_id is null or owner_id = app.current_owner_id())
  );

-- ---------------------------------------------------------------------
-- 11. Verified Owner Enrollment Function (Idempotent & Audited)
-- ---------------------------------------------------------------------
create or replace function app.enroll_verified_owners() returns void
language plpgsql security definer set search_path = app, pg_temp as $$
declare
  v_jade_user uuid := 'c570c63a-c9d8-44fc-b47b-165aed89d764'::uuid;
  v_kael_user uuid := 'aa44892b-67d1-4c22-93d0-371a61e51caa'::uuid;
begin
  -- Only enroll when both verified user accounts exist in app.users
  if not exists (select 1 from app.users where id = v_jade_user)
     or not exists (select 1 from app.users where id = v_kael_user) then
    return;
  end if;

  -- Confirm neither account has a creator profile row
  if exists (select 1 from app.creators where user_id in (v_jade_user, v_kael_user)) then
    raise exception 'Cannot enroll owner: target account holds a creator profile.' using errcode = '42501';
  end if;

  -- Transition both verified accounts to active owner role
  update app.users
     set role = 'owner',
         status = 'active',
         email_verified_at = coalesce(email_verified_at, now()),
         updated_at = now()
   where id in (v_jade_user, v_kael_user)
     and (role <> 'owner' or status <> 'active' or email_verified_at is null);

  -- Enroll OWNER_001 (Jade) and OWNER_002 (Kael Veyre)
  insert into app.platform_owners (id, auth_user_id, display_name, status)
  values
    ('OWNER_001', v_jade_user, 'Jade', 'active'),
    ('OWNER_002', v_kael_user, 'Kael Veyre', 'active')
  on conflict (id) do update
    set auth_user_id = excluded.auth_user_id,
        display_name = excluded.display_name,
        status = 'active',
        updated_at = now();

  -- Ensure 50% (5000 bps) active allocation for OWNER_001
  if not exists (select 1 from app.ownership_allocations where owner_id = 'OWNER_001' and effective_to is null) then
    insert into app.ownership_allocations (owner_id, percentage_basis_points, approval_reference)
    values ('OWNER_001', 5000, 'APPROVED-FOUNDING-ALLOCATION-50-50');
  end if;

  -- Ensure 50% (5000 bps) active allocation for OWNER_002
  if not exists (select 1 from app.ownership_allocations where owner_id = 'OWNER_002' and effective_to is null) then
    insert into app.ownership_allocations (owner_id, percentage_basis_points, approval_reference)
    values ('OWNER_002', 5000, 'APPROVED-FOUNDING-ALLOCATION-50-50');
  end if;

  -- Ensure Account A for OWNER_001 (Jade)
  if not exists (select 1 from app.payout_destinations where owner_id = 'OWNER_001' and status = 'active') then
    insert into app.payout_destinations (
      owner_id, account_label, provider, provider_account_reference,
      masked_details, destination_type, currency, verification_status, status
    ) values (
      'OWNER_001', 'Account A', 'settlement_vault', 'dest_owner001_acct_a',
      'Account A •••• 4101', 'bank_account', 'USD', 'verified', 'active'
    );
  end if;

  -- Ensure Account B for OWNER_002 (Kael Veyre)
  if not exists (select 1 from app.payout_destinations where owner_id = 'OWNER_002' and status = 'active') then
    insert into app.payout_destinations (
      owner_id, account_label, provider, provider_account_reference,
      masked_details, destination_type, currency, verification_status, status
    ) values (
      'OWNER_002', 'Account B', 'settlement_vault', 'dest_owner002_acct_b',
      'Account B •••• 8202', 'bank_account', 'USD', 'verified', 'active'
    );
  end if;

  -- Record enrollment in audit logs if not yet recorded
  if not exists (select 1 from app.financial_audit_events where event_type = 'owner.enrolled' and resource_id = 'OWNER_001') then
    insert into app.financial_audit_events (actor_id, owner_id, event_type, resource_type, resource_id, metadata)
    values
      (v_jade_user, 'OWNER_001', 'owner.enrolled', 'platform_owner', 'OWNER_001',
       jsonb_build_object('display_name', 'Jade', 'percentage_basis_points', 5000, 'payout_account', 'Account A')),
      (v_kael_user, 'OWNER_002', 'owner.enrolled', 'platform_owner', 'OWNER_002',
       jsonb_build_object('display_name', 'Kael Veyre', 'percentage_basis_points', 5000, 'payout_account', 'Account B'));

    insert into app.audit_log (actor_id, action, target_type, target_id, metadata)
    values
      (v_jade_user, 'owner.enroll', 'platform_owner', 'OWNER_001',
       jsonb_build_object('display_name', 'Jade', 'percentage_basis_points', 5000)),
      (v_kael_user, 'owner.enroll', 'platform_owner', 'OWNER_002',
       jsonb_build_object('display_name', 'Kael Veyre', 'percentage_basis_points', 5000));
  end if;
end $$;

revoke all on function app.enroll_verified_owners() from public;

-- Enroll immediately if the verified accounts already exist in app.users
select app.enroll_verified_owners();

