-- ============================================================================
-- DivaFans — Creator Referral, Earnings, Country Eligibility & Withdrawal System
-- ============================================================================
-- Implements:
--   1. Configurable US LLC (Wyoming / Delaware / Unconfirmed) & platform fee/referral config
--   2. Historical payment term snapshots on app.payments (85% creator / 15% platform / 10% of fee referral)
--   3. Extended double-entry ledger accounts (referral:<uuid>, referral_hold:<uuid>, processing_expenses, owner_distributions)
--   4. Direct single-level creator recruitment links & immutable attribution (app.creator_recruitment_links, app.creator_recruitments, app.referral_commissions)
--   5. Country payout capability matrix (US, individual European countries, Morocco, individual GCC countries)
--   6. Creator bank onboarding (masked references only, never raw account numbers/IBANs) & monetization waitlist
--   7. Extended withdrawal lifecycle (requested -> processing -> paid | failed | canceled) with transfer_ref vs bank_payout_ref
--   8. Referral liability deduction in owner financial distribution periods
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Platform Financial & Entity Configuration
-- ----------------------------------------------------------------------------
create table if not exists app.platform_financial_config (
  id                            int primary key default 1 check (id = 1),
  company_country               char(2) not null default 'US' check (company_country = 'US'),
  formation_state               text not null default 'UNCONFIRMED' check (formation_state in ('WY', 'DE', 'UNCONFIRMED')),
  legal_entity_name             text,
  trading_name                  text,
  stripe_account_id             text,
  business_verified             boolean not null default false,
  platform_fee_bps              int not null default 1500 check (platform_fee_bps between 0 and 5000),
  creator_share_bps             int not null default 8500 check (creator_share_bps between 5000 and 10000),
  referral_fee_bps_of_platform  int not null default 1000 check (referral_fee_bps_of_platform between 0 and 5000),
  processing_funded_by_platform boolean not null default true,
  default_min_withdrawal_cents  int not null default 5000 check (default_min_withdrawal_cents >= 100),
  settlement_hold_days          int not null default 14 check (settlement_hold_days between 0 and 90),
  fan_statement_descriptor      text check (fan_statement_descriptor is null or (char_length(fan_statement_descriptor) between 5 and 22 and fan_statement_descriptor ~ '^[A-Za-z0-9 .*-]+$')),
  fan_statement_suffix          text check (fan_statement_suffix is null or (char_length(fan_statement_suffix) between 2 and 12 and fan_statement_suffix ~ '^[A-Za-z0-9 .*-]+$')),
  payout_sender_descriptor      text check (payout_sender_descriptor is null or char_length(payout_sender_descriptor) between 3 and 32),
  receipt_business_name         text,
  descriptors_approved          boolean not null default false,
  updated_at                    timestamptz not null default now(),
  updated_by                    uuid references app.users(id),
  check (platform_fee_bps + creator_share_bps = 10000)
);

insert into app.platform_financial_config (
  id, company_country, formation_state, legal_entity_name, trading_name,
  stripe_account_id, business_verified, platform_fee_bps, creator_share_bps,
  referral_fee_bps_of_platform, processing_funded_by_platform,
  default_min_withdrawal_cents, settlement_hold_days,
  fan_statement_descriptor, fan_statement_suffix, payout_sender_descriptor,
  receipt_business_name, descriptors_approved
) values (
  1, 'US', 'UNCONFIRMED', null, null,
  null, false, 1500, 8500,
  1000, true,
  5000, 14,
  null, null, null,
  null, false
) on conflict (id) do nothing;

alter table app.platform_financial_config enable row level security;
revoke all on table app.platform_financial_config from public;
grant select on table app.platform_financial_config to mk_app;

drop policy if exists platform_financial_config_select on app.platform_financial_config;
create policy platform_financial_config_select on app.platform_financial_config
  for select to mk_app
  using (true);

-- ----------------------------------------------------------------------------
-- 2. Historical Financial Terms Snapshot on app.payments
-- ----------------------------------------------------------------------------
alter table app.payments
  add column if not exists eligible_amount_cents int check (eligible_amount_cents is null or eligible_amount_cents >= 0),
  add column if not exists tax_cents int not null default 0 check (tax_cents >= 0),
  add column if not exists discount_cents int not null default 0 check (discount_cents >= 0),
  add column if not exists creator_share_bps int check (creator_share_bps is null or (creator_share_bps between 0 and 10000)),
  add column if not exists referral_fee_bps_of_platform int check (referral_fee_bps_of_platform is null or (referral_fee_bps_of_platform between 0 and 10000)),
  add column if not exists referrer_creator_id uuid references app.users(id) on delete restrict,
  add column if not exists creator_allocation_cents int check (creator_allocation_cents is null or creator_allocation_cents >= 0),
  add column if not exists platform_fee_cents int check (platform_fee_cents is null or platform_fee_cents >= 0),
  add column if not exists referral_commission_cents int not null default 0 check (referral_commission_cents >= 0),
  add column if not exists platform_net_cents int check (platform_net_cents is null or platform_net_cents >= 0),
  add column if not exists processor_fee_cents int not null default 0 check (processor_fee_cents >= 0),
  add column if not exists refunded_amount_cents int not null default 0 check (refunded_amount_cents >= 0),
  add column if not exists statement_descriptor_snapshot text;

-- Backfill existing rows so historical snapshots are populated consistently
update app.payments
   set eligible_amount_cents = coalesce(eligible_amount_cents, amount_cents),
       creator_share_bps = coalesce(creator_share_bps, 10000 - fee_bps),
       referral_fee_bps_of_platform = coalesce(referral_fee_bps_of_platform, 0),
       creator_allocation_cents = coalesce(creator_allocation_cents, amount_cents - ((amount_cents * fee_bps) / 10000)),
       platform_fee_cents = coalesce(platform_fee_cents, (amount_cents * fee_bps) / 10000),
       platform_net_cents = coalesce(platform_net_cents, (amount_cents * fee_bps) / 10000)
 where eligible_amount_cents is null;

-- ----------------------------------------------------------------------------
-- 3. Extend Double-Entry Ledger Account Constraint
-- ----------------------------------------------------------------------------
alter table app.ledger_entries
  drop constraint if exists ledger_entries_account_check;

alter table app.ledger_entries
  add constraint ledger_entries_account_check
  check (
    account ~ '^(provider_clearing|platform_fees|processing_expenses|owner_distributions|payout_clearing|creator:[0-9a-f-]{36}|creator_hold:[0-9a-f-]{36}|referral:[0-9a-f-]{36}|referral_hold:[0-9a-f-]{36})$'
  );

-- ----------------------------------------------------------------------------
-- 4. Direct Single-Level Creator Recruitment Links & Attribution
-- ----------------------------------------------------------------------------
-- Separate from app.creator_referrals (which tracks fan invites /join/[handle]).
create table if not exists app.creator_recruitment_links (
  creator_id       uuid primary key references app.creators(user_id) on delete cascade,
  recruitment_code citext not null unique check (recruitment_code ~ '^[a-z0-9_-]{4,32}$'),
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table app.creator_recruitment_links enable row level security;
revoke all on table app.creator_recruitment_links from public;
grant select, insert, update on table app.creator_recruitment_links to mk_app;

drop policy if exists creator_recruitment_links_select on app.creator_recruitment_links;
create policy creator_recruitment_links_select on app.creator_recruitment_links
  for select to mk_app
  using (active = true or creator_id = app.uid() or app.is_owner());

drop policy if exists creator_recruitment_links_write on app.creator_recruitment_links;
create policy creator_recruitment_links_write on app.creator_recruitment_links
  for all to mk_app
  using (creator_id = app.uid() or app.is_owner())
  with check (creator_id = app.uid() or app.is_owner());

-- Direct 1-level creator-to-creator referral attribution
create table if not exists app.creator_recruitments (
  referred_creator_id   uuid primary key references app.users(id) on delete cascade,
  referrer_creator_id   uuid not null references app.users(id) on delete restrict,
  recruitment_code      citext not null,
  status                text not null default 'captured' check (status in ('captured', 'confirmed', 'revoked')),
  agreement_accepted_at timestamptz,
  captured_at           timestamptz not null default now(),
  confirmed_at          timestamptz,
  attributed_by         uuid references app.users(id),
  override_reason       text,
  updated_at            timestamptz not null default now(),
  check (referred_creator_id <> referrer_creator_id)
);

create index if not exists creator_recruitments_referrer_idx
  on app.creator_recruitments (referrer_creator_id, status);

alter table app.creator_recruitments enable row level security;
revoke all on table app.creator_recruitments from public;
grant select, insert, update on table app.creator_recruitments to mk_app;

drop policy if exists creator_recruitments_select on app.creator_recruitments;
create policy creator_recruitments_select on app.creator_recruitments
  for select to mk_app
  using (
    referred_creator_id = app.uid()
    or referrer_creator_id = app.uid()
    or app.is_owner()
  );

drop policy if exists creator_recruitments_insert on app.creator_recruitments;
create policy creator_recruitments_insert on app.creator_recruitments
  for insert to mk_app
  with check (
    referred_creator_id = app.uid()
    or app.is_owner()
  );

drop policy if exists creator_recruitments_update on app.creator_recruitments;
create policy creator_recruitments_update on app.creator_recruitments
  for update to mk_app
  using (
    referred_creator_id = app.uid()
    or app.is_owner()
  )
  with check (
    referred_creator_id = app.uid()
    or app.is_owner()
  );

-- Helper to detect circular referral chains of any length (A -> B -> A, A -> B -> C -> A)
create or replace function app.has_creator_recruitment_cycle(
  p_referred uuid,
  p_referrer uuid
) returns boolean
language plpgsql
stable
security definer
set search_path = app, pg_temp
as $$
declare
  v_curr uuid := p_referrer;
  v_hops int := 0;
begin
  if p_referred is null or p_referrer is null then
    return false;
  end if;
  if p_referred = p_referrer then
    return true;
  end if;

  while v_curr is not null and v_hops < 25 loop
    if v_curr = p_referred then
      return true;
    end if;
    select r.referrer_creator_id
      into v_curr
      from app.creator_recruitments r
     where r.referred_creator_id = v_curr;
    v_hops := v_hops + 1;
  end loop;

  return false;
end;
$$;
revoke all on function app.has_creator_recruitment_cycle(uuid, uuid) from public;
grant execute on function app.has_creator_recruitment_cycle(uuid, uuid) to mk_app;

-- Guard trigger (SECURITY INVOKER per schema-lint) enforcing:
--   1. No self-referral
--   2. No circular referral chains
--   3. Referrer cannot be silently replaced once attributed (only via audited admin/owner override with override_reason)
create or replace function app.creator_recruitments_guard() returns trigger
language plpgsql
set search_path = app, pg_temp
as $$
begin
  if new.referred_creator_id = new.referrer_creator_id then
    raise exception 'self_referral_prohibited';
  end if;

  if app.has_creator_recruitment_cycle(new.referred_creator_id, new.referrer_creator_id) then
    raise exception 'circular_referral_prohibited';
  end if;

  if tg_op = 'UPDATE' then
    if old.referrer_creator_id <> new.referrer_creator_id then
      if current_user = 'mk_app' and not app.is_owner() then
        raise exception 'referral_attribution_immutable';
      end if;
      if new.override_reason is null or length(btrim(new.override_reason)) < 5 then
        raise exception 'referral_override_reason_required';
      end if;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists creator_recruitments_guard_trg on app.creator_recruitments;
create trigger creator_recruitments_guard_trg
  before insert or update on app.creator_recruitments
  for each row execute function app.creator_recruitments_guard();

-- Per-transaction single-level referral commission records
create table if not exists app.referral_commissions (
  id                        uuid primary key default gen_random_uuid(),
  payment_id                uuid not null unique references app.payments(id) on delete restrict,
  referrer_creator_id       uuid not null references app.users(id) on delete restrict,
  referred_creator_id       uuid not null references app.users(id) on delete restrict,
  currency                  char(3) not null,
  eligible_purchase_cents   bigint not null check (eligible_purchase_cents >= 0),
  platform_fee_cents        bigint not null check (platform_fee_cents >= 0),
  referral_rate_bps_of_fee  int not null check (referral_rate_bps_of_fee between 0 and 10000),
  commission_cents          bigint not null check (commission_cents >= 0),
  refunded_commission_cents bigint not null default 0 check (refunded_commission_cents >= 0 and refunded_commission_cents <= commission_cents),
  status                    text not null default 'credited' check (status in ('credited', 'partially_reversed', 'reversed', 'held')),
  ledger_txn_id             uuid not null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  check (referrer_creator_id <> referred_creator_id)
);

create index if not exists referral_commissions_referrer_idx
  on app.referral_commissions (referrer_creator_id, created_at desc);

alter table app.referral_commissions enable row level security;
revoke all on table app.referral_commissions from public;
grant select on table app.referral_commissions to mk_app;

drop policy if exists referral_commissions_select on app.referral_commissions;
create policy referral_commissions_select on app.referral_commissions
  for select to mk_app
  using (
    referrer_creator_id = app.uid()
    or app.is_owner()
  );

-- ----------------------------------------------------------------------------
-- 5. Country Payout Capability Matrix & Creator Bank Onboarding
-- ----------------------------------------------------------------------------
create table if not exists app.country_payout_capabilities (
  country_code                  char(2) primary key check (country_code ~ '^[A-Z]{2}$'),
  country_name                  text not null,
  region                        text not null check (region in ('north_america', 'europe', 'gcc', 'mena', 'other')),
  company_country               char(2) not null default 'US',
  individual_supported          boolean not null default false,
  business_supported            boolean not null default false,
  payment_acceptance_supported  boolean not null default true,
  connect_cross_border_payouts  boolean not null default false,
  global_payouts_corridor       boolean not null default false,
  payout_status                 text not null check (payout_status in (
    'supported_connect_sandbox',
    'requires_global_payouts_or_adapter',
    'pending_verification',
    'unsupported'
  )),
  supported_currencies          text[] not null default '{}',
  supported_bank_formats        text[] not null default '{}',
  required_verification         text[] not null default '{}',
  provider_notes                text not null,
  updated_at                    timestamptz not null default now()
);

alter table app.country_payout_capabilities enable row level security;
revoke all on table app.country_payout_capabilities from public;
grant select on table app.country_payout_capabilities to mk_app;

drop policy if exists country_payout_capabilities_select on app.country_payout_capabilities;
create policy country_payout_capabilities_select on app.country_payout_capabilities
  for select to mk_app
  using (true);

-- Seed US, Canada, individual European countries, Morocco (MA), and individual GCC countries (AE, SA, QA, KW, BH, OM)
insert into app.country_payout_capabilities (
  country_code, country_name, region, company_country,
  individual_supported, business_supported, payment_acceptance_supported,
  connect_cross_border_payouts, global_payouts_corridor, payout_status,
  supported_currencies, supported_bank_formats, required_verification, provider_notes
) values
  -- North America
  ('US', 'United States', 'north_america', 'US', true, true, true, true, true, 'supported_connect_sandbox',
    array['USD'], array['ACH_ROUTING_ACCOUNT'], array['government_id', 'ssn_last4_or_ein', 'bank_account'],
    'Domestic US Stripe Connect Express/Custom connected accounts and ACH bank payouts supported.'),
  ('CA', 'Canada', 'north_america', 'US', true, true, true, true, true, 'supported_connect_sandbox',
    array['CAD', 'USD'], array['EFT_TRANSIT_INSTITUTION'], array['government_id', 'tax_id', 'bank_account'],
    'Supported via US Stripe Connect Cross-Border Payouts to Canadian bank accounts.'),

  -- Individual European Countries (supported via US Stripe Connect Cross-Border Payouts)
  ('FR', 'France', 'europe', 'US', true, true, true, true, true, 'supported_connect_sandbox',
    array['EUR'], array['IBAN_SEPA'], array['government_id', 'proof_of_address', 'iban'],
    'Supported via US Stripe Connect Cross-Border Payouts (SEPA EUR IBAN).'),
  ('DE', 'Germany', 'europe', 'US', true, true, true, true, true, 'supported_connect_sandbox',
    array['EUR'], array['IBAN_SEPA'], array['government_id', 'proof_of_address', 'iban'],
    'Supported via US Stripe Connect Cross-Border Payouts (SEPA EUR IBAN).'),
  ('ES', 'Spain', 'europe', 'US', true, true, true, true, true, 'supported_connect_sandbox',
    array['EUR'], array['IBAN_SEPA'], array['government_id', 'proof_of_address', 'iban'],
    'Supported via US Stripe Connect Cross-Border Payouts (SEPA EUR IBAN).'),
  ('IT', 'Italy', 'europe', 'US', true, true, true, true, true, 'supported_connect_sandbox',
    array['EUR'], array['IBAN_SEPA'], array['government_id', 'tax_code_codice_fiscale', 'iban'],
    'Supported via US Stripe Connect Cross-Border Payouts (SEPA EUR IBAN).'),
  ('NL', 'Netherlands', 'europe', 'US', true, true, true, true, true, 'supported_connect_sandbox',
    array['EUR'], array['IBAN_SEPA'], array['government_id', 'proof_of_address', 'iban'],
    'Supported via US Stripe Connect Cross-Border Payouts (SEPA EUR IBAN).'),
  ('BE', 'Belgium', 'europe', 'US', true, true, true, true, true, 'supported_connect_sandbox',
    array['EUR'], array['IBAN_SEPA'], array['government_id', 'proof_of_address', 'iban'],
    'Supported via US Stripe Connect Cross-Border Payouts (SEPA EUR IBAN).'),
  ('AT', 'Austria', 'europe', 'US', true, true, true, true, true, 'supported_connect_sandbox',
    array['EUR'], array['IBAN_SEPA'], array['government_id', 'proof_of_address', 'iban'],
    'Supported via US Stripe Connect Cross-Border Payouts (SEPA EUR IBAN).'),
  ('IE', 'Ireland', 'europe', 'US', true, true, true, true, true, 'supported_connect_sandbox',
    array['EUR'], array['IBAN_SEPA'], array['government_id', 'proof_of_address', 'iban'],
    'Supported via US Stripe Connect Cross-Border Payouts (SEPA EUR IBAN).'),
  ('PT', 'Portugal', 'europe', 'US', true, true, true, true, true, 'supported_connect_sandbox',
    array['EUR'], array['IBAN_SEPA'], array['government_id', 'proof_of_address', 'iban'],
    'Supported via US Stripe Connect Cross-Border Payouts (SEPA EUR IBAN).'),
  ('FI', 'Finland', 'europe', 'US', true, true, true, true, true, 'supported_connect_sandbox',
    array['EUR'], array['IBAN_SEPA'], array['government_id', 'proof_of_address', 'iban'],
    'Supported via US Stripe Connect Cross-Border Payouts (SEPA EUR IBAN).'),
  ('GR', 'Greece', 'europe', 'US', true, true, true, true, true, 'supported_connect_sandbox',
    array['EUR'], array['IBAN_SEPA'], array['government_id', 'proof_of_address', 'iban'],
    'Supported via US Stripe Connect Cross-Border Payouts (SEPA EUR IBAN).'),
  ('LU', 'Luxembourg', 'europe', 'US', true, true, true, true, true, 'supported_connect_sandbox',
    array['EUR'], array['IBAN_SEPA'], array['government_id', 'proof_of_address', 'iban'],
    'Supported via US Stripe Connect Cross-Border Payouts (SEPA EUR IBAN).'),
  ('EE', 'Estonia', 'europe', 'US', true, true, true, true, true, 'supported_connect_sandbox',
    array['EUR'], array['IBAN_SEPA'], array['government_id', 'proof_of_address', 'iban'],
    'Supported via US Stripe Connect Cross-Border Payouts (SEPA EUR IBAN).'),
  ('LV', 'Latvia', 'europe', 'US', true, true, true, true, true, 'supported_connect_sandbox',
    array['EUR'], array['IBAN_SEPA'], array['government_id', 'proof_of_address', 'iban'],
    'Supported via US Stripe Connect Cross-Border Payouts (SEPA EUR IBAN).'),
  ('LT', 'Lithuania', 'europe', 'US', true, true, true, true, true, 'supported_connect_sandbox',
    array['EUR'], array['IBAN_SEPA'], array['government_id', 'proof_of_address', 'iban'],
    'Supported via US Stripe Connect Cross-Border Payouts (SEPA EUR IBAN).'),
  ('SK', 'Slovakia', 'europe', 'US', true, true, true, true, true, 'supported_connect_sandbox',
    array['EUR'], array['IBAN_SEPA'], array['government_id', 'proof_of_address', 'iban'],
    'Supported via US Stripe Connect Cross-Border Payouts (SEPA EUR IBAN).'),
  ('SI', 'Slovenia', 'europe', 'US', true, true, true, true, true, 'supported_connect_sandbox',
    array['EUR'], array['IBAN_SEPA'], array['government_id', 'proof_of_address', 'iban'],
    'Supported via US Stripe Connect Cross-Border Payouts (SEPA EUR IBAN).'),
  ('CY', 'Cyprus', 'europe', 'US', true, true, true, true, true, 'supported_connect_sandbox',
    array['EUR'], array['IBAN_SEPA'], array['government_id', 'proof_of_address', 'iban'],
    'Supported via US Stripe Connect Cross-Border Payouts (SEPA EUR IBAN).'),
  ('MT', 'Malta', 'europe', 'US', true, true, true, true, true, 'supported_connect_sandbox',
    array['EUR'], array['IBAN_SEPA'], array['government_id', 'proof_of_address', 'iban'],
    'Supported via US Stripe Connect Cross-Border Payouts (SEPA EUR IBAN).'),
  ('HR', 'Croatia', 'europe', 'US', true, true, true, true, true, 'supported_connect_sandbox',
    array['EUR'], array['IBAN_SEPA'], array['government_id', 'proof_of_address', 'iban'],
    'Supported via US Stripe Connect Cross-Border Payouts (SEPA EUR IBAN).'),
  ('SE', 'Sweden', 'europe', 'US', true, true, true, true, true, 'supported_connect_sandbox',
    array['SEK', 'EUR'], array['IBAN_SEPA', 'BANKGIRO'], array['government_id', 'proof_of_address', 'iban'],
    'Supported via US Stripe Connect Cross-Border Payouts (SEK or EUR IBAN).'),
  ('DK', 'Denmark', 'europe', 'US', true, true, true, true, true, 'supported_connect_sandbox',
    array['DKK', 'EUR'], array['IBAN_SEPA'], array['government_id', 'proof_of_address', 'iban'],
    'Supported via US Stripe Connect Cross-Border Payouts (DKK or EUR IBAN).'),
  ('NO', 'Norway', 'europe', 'US', true, true, true, true, true, 'supported_connect_sandbox',
    array['NOK', 'EUR'], array['IBAN_SEPA'], array['government_id', 'proof_of_address', 'iban'],
    'Supported via US Stripe Connect Cross-Border Payouts (NOK or EUR IBAN).'),
  ('PL', 'Poland', 'europe', 'US', true, true, true, true, true, 'supported_connect_sandbox',
    array['PLN', 'EUR'], array['IBAN_SEPA'], array['government_id', 'proof_of_address', 'iban'],
    'Supported via US Stripe Connect Cross-Border Payouts (PLN or EUR IBAN).'),
  ('CZ', 'Czechia', 'europe', 'US', true, true, true, true, true, 'supported_connect_sandbox',
    array['CZK', 'EUR'], array['IBAN_SEPA'], array['government_id', 'proof_of_address', 'iban'],
    'Supported via US Stripe Connect Cross-Border Payouts (CZK or EUR IBAN).'),
  ('RO', 'Romania', 'europe', 'US', true, true, true, true, true, 'supported_connect_sandbox',
    array['RON', 'EUR'], array['IBAN_SEPA'], array['government_id', 'proof_of_address', 'iban'],
    'Supported via US Stripe Connect Cross-Border Payouts (RON or EUR IBAN).'),
  ('HU', 'Hungary', 'europe', 'US', true, true, true, true, true, 'supported_connect_sandbox',
    array['HUF', 'EUR'], array['IBAN_SEPA'], array['government_id', 'proof_of_address', 'iban'],
    'Supported via US Stripe Connect Cross-Border Payouts (HUF or EUR IBAN).'),
  ('BG', 'Bulgaria', 'europe', 'US', true, true, true, true, true, 'supported_connect_sandbox',
    array['BGN', 'EUR'], array['IBAN_SEPA'], array['government_id', 'proof_of_address', 'iban'],
    'Supported via US Stripe Connect Cross-Border Payouts (BGN or EUR IBAN).'),
  ('GB', 'United Kingdom', 'europe', 'US', true, true, true, true, true, 'supported_connect_sandbox',
    array['GBP'], array['UK_SORT_CODE_ACCOUNT', 'IBAN_GB'], array['government_id', 'proof_of_address', 'uk_bank_account'],
    'Supported via US Stripe Connect Cross-Border Payouts (GBP Faster Payments / BACS).'),
  ('CH', 'Switzerland', 'europe', 'US', true, true, true, true, true, 'supported_connect_sandbox',
    array['CHF', 'EUR'], array['IBAN_CH'], array['government_id', 'proof_of_address', 'iban'],
    'Supported via US Stripe Connect Cross-Border Payouts (CHF or EUR IBAN).'),

  -- Morocco (MENA) — requires Stripe Global Payouts or approved cross-border payout corridor adapter
  ('MA', 'Morocco', 'mena', 'US', false, false, true, false, true, 'requires_global_payouts_or_adapter',
    array['MAD', 'EUR', 'USD'], array['MOROCCO_RIB_24_OR_IBAN_MA'], array['cnie_or_passport', 'tax_declaration_w8ben', 'bank_rib_certificate'],
    'Not supported by standard self-serve US Stripe Connect Cross-Border connected accounts. Requires Stripe Global Payouts (Outbound Payments) enablement or an approved regulated cross-border payout corridor adapter before paid monetization can be activated.'),

  -- Individual GCC Countries — evaluated individually per official US Stripe Connect & Global Payouts rules
  ('AE', 'United Arab Emirates', 'gcc', 'US', false, false, true, false, true, 'requires_global_payouts_or_adapter',
    array['AED', 'USD'], array['IBAN_AE'], array['emirates_id_or_passport', 'w8ben_or_trade_license', 'uae_iban'],
    'US Stripe platforms cannot use standard self-serve Connect cross-border transfers to AE without Stripe Global Payouts (Outbound Payments) or an approved UAE corridor adapter.'),
  ('SA', 'Saudi Arabia', 'gcc', 'US', false, false, true, false, false, 'requires_global_payouts_or_adapter',
    array['SAR', 'USD'], array['IBAN_SA'], array['national_id_or_iqama', 'w8ben_or_cr', 'saudi_iban'],
    'Not supported by standard US Stripe Connect Cross-Border Payouts. Requires approved cross-border payout corridor adapter and SAR/USD bank rail enablement.'),
  ('QA', 'Qatar', 'gcc', 'US', false, false, true, false, true, 'requires_global_payouts_or_adapter',
    array['QAR', 'USD'], array['IBAN_QA'], array['qatar_id_or_passport', 'w8ben', 'qatar_iban'],
    'Not supported by standard US Stripe Connect Cross-Border Payouts. Requires Stripe Global Payouts enablement or approved payout corridor adapter.'),
  ('KW', 'Kuwait', 'gcc', 'US', false, false, true, false, true, 'requires_global_payouts_or_adapter',
    array['KWD', 'USD'], array['IBAN_KW'], array['civil_id_or_passport', 'w8ben', 'kuwait_iban'],
    'Not supported by standard US Stripe Connect Cross-Border Payouts. Requires Stripe Global Payouts enablement or approved payout corridor adapter.'),
  ('BH', 'Bahrain', 'gcc', 'US', false, false, true, false, true, 'requires_global_payouts_or_adapter',
    array['BHD', 'USD'], array['IBAN_BH'], array['cpr_id_or_passport', 'w8ben', 'bahrain_iban'],
    'Not supported by standard US Stripe Connect Cross-Border Payouts. Requires Stripe Global Payouts enablement or approved payout corridor adapter.'),
  ('OM', 'Oman', 'gcc', 'US', false, false, true, false, true, 'requires_global_payouts_or_adapter',
    array['OMR', 'USD'], array['IBAN_OM_OR_SWIFT'], array['national_id_or_passport', 'w8ben', 'oman_bank_account'],
    'Not supported by standard US Stripe Connect Cross-Border Payouts. Requires Stripe Global Payouts enablement or approved payout corridor adapter.')
on conflict (country_code) do update set
  country_name = excluded.country_name,
  region = excluded.region,
  individual_supported = excluded.individual_supported,
  business_supported = excluded.business_supported,
  connect_cross_border_payouts = excluded.connect_cross_border_payouts,
  global_payouts_corridor = excluded.global_payouts_corridor,
  payout_status = excluded.payout_status,
  supported_currencies = excluded.supported_currencies,
  supported_bank_formats = excluded.supported_bank_formats,
  required_verification = excluded.required_verification,
  provider_notes = excluded.provider_notes,
  updated_at = now();

-- Creator Payout Accounts (stores only provider tokens & masked bank details; never raw IBANs or account numbers)
create table if not exists app.creator_payout_accounts (
  creator_id            uuid primary key references app.creators(user_id) on delete cascade,
  residence_country     char(2) not null references app.country_payout_capabilities(country_code),
  entity_type           text not null default 'individual' check (entity_type in ('individual', 'company')),
  provider              text not null default 'stripe_connect_sandbox' check (provider in ('stripe_connect_sandbox', 'global_payouts_sandbox')),
  provider_account_ref  text not null check (
    provider_account_ref ~ '^acct_[A-Za-z0-9_]{6,48}$'
    and provider_account_ref !~ '^[0-9]{8,34}$'
  ),
  bank_name             text not null check (char_length(btrim(bank_name)) between 2 and 100),
  masked_account        text not null check (masked_account ~ '^•••• [0-9A-Za-z]{4}$'),
  currency              char(3) not null check (currency ~ '^[A-Z]{3}$'),
  kyc_verified          boolean not null default false,
  payouts_enabled       boolean not null default false,
  auto_payout_enabled   boolean not null default false,
  auto_payout_schedule  text not null default 'manual' check (auto_payout_schedule in ('manual', 'weekly')),
  security_hold_until   timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table app.creator_payout_accounts enable row level security;
revoke all on table app.creator_payout_accounts from public;
grant select, insert, update on table app.creator_payout_accounts to mk_app;

drop policy if exists creator_payout_accounts_select on app.creator_payout_accounts;
create policy creator_payout_accounts_select on app.creator_payout_accounts
  for select to mk_app
  using (creator_id = app.uid() or app.is_owner());

drop policy if exists creator_payout_accounts_write on app.creator_payout_accounts;
create policy creator_payout_accounts_write on app.creator_payout_accounts
  for all to mk_app
  using (creator_id = app.uid() or app.is_owner())
  with check (creator_id = app.uid() or app.is_owner());

-- Creator Monetization Waitlist (for creators in countries whose payout corridor is not yet enabled)
create table if not exists app.creator_monetization_waitlist (
  id                uuid primary key default gen_random_uuid(),
  creator_id        uuid not null unique references app.users(id) on delete cascade,
  residence_country char(2) not null,
  entity_type       text not null default 'individual' check (entity_type in ('individual', 'company')),
  preferred_currency char(3) not null default 'USD',
  status            text not null default 'waitlisted' check (status in ('waitlisted', 'under_review', 'enabled', 'declined')),
  reason            text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table app.creator_monetization_waitlist enable row level security;
revoke all on table app.creator_monetization_waitlist from public;
grant select, insert, update on table app.creator_monetization_waitlist to mk_app;

drop policy if exists creator_monetization_waitlist_select on app.creator_monetization_waitlist;
create policy creator_monetization_waitlist_select on app.creator_monetization_waitlist
  for select to mk_app
  using (creator_id = app.uid() or app.is_owner());

drop policy if exists creator_monetization_waitlist_write on app.creator_monetization_waitlist;
create policy creator_monetization_waitlist_write on app.creator_monetization_waitlist
  for all to mk_app
  using (creator_id = app.uid() or app.is_owner())
  with check (creator_id = app.uid() or app.is_owner());

-- ----------------------------------------------------------------------------
-- 6. Extend Withdrawals (app.payouts) & Owner Distribution Periods
-- ----------------------------------------------------------------------------
alter table app.payouts
  drop constraint if exists payouts_status_check;

alter table app.payouts
  add constraint payouts_status_check
  check (status in ('requested', 'approved', 'processing', 'paid', 'failed', 'canceled'));

alter table app.payouts
  add column if not exists payout_account_ref text,
  add column if not exists masked_destination text,
  add column if not exists fee_cents bigint not null default 0 check (fee_cents >= 0),
  add column if not exists net_amount_cents bigint check (net_amount_cents is null or net_amount_cents >= 0),
  add column if not exists transfer_ref text,
  add column if not exists bank_payout_ref text,
  add column if not exists idempotency_key text unique,
  add column if not exists failure_reason text,
  add column if not exists estimated_arrival_at timestamptz,
  add column if not exists processed_at timestamptz,
  add column if not exists ledger_txn_id uuid,
  add column if not exists reversal_txn_id uuid;

update app.payouts
   set net_amount_cents = coalesce(net_amount_cents, amount_cents - fee_cents)
 where net_amount_cents is null;

-- Add referral_liabilities_minor to app.financial_distribution_periods
alter table app.financial_distribution_periods
  add column if not exists referral_liabilities_minor bigint not null default 0 check (referral_liabilities_minor >= 0);

-- ----------------------------------------------------------------------------
-- 7. Security Definer Reader Functions for Creator Earnings, Referrals & Withdrawals
-- ----------------------------------------------------------------------------
create or replace function app.my_detailed_balances(p_hold_days int default 14)
returns table (
  currency              char(3),
  content_available     bigint,
  content_pending       bigint,
  content_on_hold       bigint,
  referral_available    bigint,
  referral_pending      bigint,
  referral_on_hold      bigint,
  withdrawn_in_progress bigint,
  withdrawn_completed   bigint
)
language sql
stable
security definer
set search_path = app, pg_temp
as $$
  with me as (
    select app.uid() as id
  ),
  raw_entries as (
    select l.currency, l.account, l.amount_cents, l.created_at, l.payment_id, l.memo
      from app.ledger_entries l, me
     where me.id is not null
       and l.account in (
         'creator:' || me.id::text,
         'creator_hold:' || me.id::text,
         'referral:' || me.id::text,
         'referral_hold:' || me.id::text
       )
  ),
  payout_totals as (
    select p.currency,
           coalesce(sum(p.amount_cents) filter (where p.status in ('requested', 'approved', 'processing')), 0)::bigint as in_progress,
           coalesce(sum(p.amount_cents) filter (where p.status = 'paid'), 0)::bigint as completed
      from app.payouts p, me
     where me.id is not null
       and p.creator_id = me.id
     group by p.currency
  ),
  currencies as (
    select distinct currency from raw_entries
    union
    select distinct currency from payout_totals
  )
  select c.currency,
         -- Content available: entries older than p_hold_days (or withdrawal/refund adjustments without hold)
         coalesce((
           select sum(r.amount_cents)::bigint
             from raw_entries r, me
            where r.currency = c.currency
              and r.account = 'creator:' || me.id::text
              and (
                r.payment_id is null
                or r.amount_cents < 0
                or r.created_at <= now() - make_interval(days => greatest(0, coalesce(p_hold_days, 14)))
              )
         ), 0)::bigint as content_available,
         -- Content pending: positive payment credits still within the settlement hold window
         coalesce((
           select sum(r.amount_cents)::bigint
             from raw_entries r, me
            where r.currency = c.currency
              and r.account = 'creator:' || me.id::text
              and r.payment_id is not null
              and r.amount_cents > 0
              and r.created_at > now() - make_interval(days => greatest(0, coalesce(p_hold_days, 14)))
         ), 0)::bigint as content_pending,
         -- Content on hold (disputes / reserves)
         coalesce((
           select sum(r.amount_cents)::bigint
             from raw_entries r, me
            where r.currency = c.currency
              and r.account = 'creator_hold:' || me.id::text
         ), 0)::bigint as content_on_hold,
         -- Referral available: referral credits older than p_hold_days (plus any negative adjustments/withdrawals)
         coalesce((
           select sum(r.amount_cents)::bigint
             from raw_entries r, me
            where r.currency = c.currency
              and r.account = 'referral:' || me.id::text
              and (
                r.payment_id is null
                or r.amount_cents < 0
                or r.created_at <= now() - make_interval(days => greatest(0, coalesce(p_hold_days, 14)))
              )
         ), 0)::bigint as referral_available,
         -- Referral pending: positive referral credits within settlement hold window
         coalesce((
           select sum(r.amount_cents)::bigint
             from raw_entries r, me
            where r.currency = c.currency
              and r.account = 'referral:' || me.id::text
              and r.payment_id is not null
              and r.amount_cents > 0
              and r.created_at > now() - make_interval(days => greatest(0, coalesce(p_hold_days, 14)))
         ), 0)::bigint as referral_pending,
         -- Referral on hold
         coalesce((
           select sum(r.amount_cents)::bigint
             from raw_entries r, me
            where r.currency = c.currency
              and r.account = 'referral_hold:' || me.id::text
         ), 0)::bigint as referral_on_hold,
         coalesce(pt.in_progress, 0)::bigint as withdrawn_in_progress,
         coalesce(pt.completed, 0)::bigint as withdrawn_completed
    from currencies c
    left join payout_totals pt on pt.currency = c.currency
   order by c.currency;
$$;
revoke all on function app.my_detailed_balances(int) from public;
grant execute on function app.my_detailed_balances(int) to mk_app;

create or replace function app.my_payouts_detailed()
returns table (
  id                   uuid,
  currency             char(3),
  amount_cents         bigint,
  fee_cents            bigint,
  net_amount_cents     bigint,
  status               text,
  masked_destination   text,
  transfer_ref         text,
  bank_payout_ref      text,
  failure_reason       text,
  estimated_arrival_at timestamptz,
  created_at           timestamptz,
  processed_at         timestamptz
)
language sql
stable
security definer
set search_path = app, pg_temp
as $$
  select p.id, p.currency, p.amount_cents, p.fee_cents,
         coalesce(p.net_amount_cents, p.amount_cents - p.fee_cents) as net_amount_cents,
         p.status, p.masked_destination, p.transfer_ref, p.bank_payout_ref,
         p.failure_reason, p.estimated_arrival_at, p.created_at, p.processed_at
    from app.payouts p
   where p.creator_id = app.uid()
   order by p.created_at desc
   limit 50;
$$;
revoke all on function app.my_payouts_detailed() from public;
grant execute on function app.my_payouts_detailed() to mk_app;

-- Lists creators directly referred by the current creator (1 level only, never exposing banking/email/legal info)
create or replace function app.my_referred_creators()
returns table (
  referred_creator_id uuid,
  handle              citext,
  display_name        text,
  status              text,
  captured_at         timestamptz,
  confirmed_at        timestamptz
)
language sql
stable
security definer
set search_path = app, pg_temp
as $$
  select r.referred_creator_id,
         c.handle as handle,
         coalesce(app.format_creator_display_name(c.creator_name), c.display_name, 'Diva Creator') as display_name,
         r.status,
         r.captured_at,
         r.confirmed_at
    from app.creator_recruitments r
    left join app.creators c on c.user_id = r.referred_creator_id
   where r.referrer_creator_id = app.uid()
   order by r.captured_at desc;
$$;
revoke all on function app.my_referred_creators() from public;
grant execute on function app.my_referred_creators() to mk_app;

-- Lists the current creator's own refund, chargeback, and hold adjustments
create or replace function app.my_ledger_adjustments()
returns table (
  id           bigint,
  txn_id       uuid,
  payment_id   uuid,
  account_kind text,
  amount_cents bigint,
  currency     char(3),
  memo         text,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = app, pg_temp
as $$
  with me as (select app.uid() as id)
  select l.id,
         l.txn_id,
         l.payment_id,
         case
           when l.account = 'creator:' || me.id::text then 'content'
           when l.account = 'creator_hold:' || me.id::text then 'content_hold'
           when l.account = 'referral:' || me.id::text then 'referral'
           when l.account = 'referral_hold:' || me.id::text then 'referral_hold'
           else 'other'
         end as account_kind,
         l.amount_cents,
         l.currency,
         l.memo,
         l.created_at
    from app.ledger_entries l, me
   where me.id is not null
     and l.account in (
       'creator:' || me.id::text,
       'creator_hold:' || me.id::text,
       'referral:' || me.id::text,
       'referral_hold:' || me.id::text
     )
     and (l.amount_cents < 0 or l.account like '%_hold:%' or l.memo ilike '%refund%' or l.memo ilike '%dispute%' or l.memo ilike '%reversal%')
   order by l.created_at desc
   limit 100;
$$;
revoke all on function app.my_ledger_adjustments() from public;
grant execute on function app.my_ledger_adjustments() to mk_app;

