-- Phase 12: Creator Studio — earnings read layer.
--
-- app.payments / app.payouts / app.ledger_entries are written only by the
-- payment engine (system role) and are deliberately NOT granted to the mk_app
-- role. To render a creator's OWN earnings we add creator-scoped
-- SECURITY DEFINER readers that expose only the caller's rows and only when
-- the caller is an active creator. They never reveal fan identities, provider
-- references or another creator's data.
--
-- INERT: with FEATURE_PAYMENTS off no rows exist, so these return empty.

create index if not exists payouts_creator on app.payouts (creator_id, created_at desc);

-- The caller's own payments (no fan ids, no provider references).
create or replace function app.my_payments()
returns table (
  id           uuid,
  kind         text,
  target_id    uuid,
  amount_cents int,
  currency     char(3),
  status       text,
  fee_bps      int,
  created_at   timestamptz
)
language sql stable security definer set search_path = app, pg_temp as $$
  select p.id, p.kind, p.target_id, p.amount_cents, p.currency, p.status, p.fee_bps, p.created_at
    from app.payments p
   where p.creator_id = app.uid() and app.viewer_role() = 'creator'
   order by p.created_at desc
   limit 500
$$;
revoke all on function app.my_payments() from public;
grant execute on function app.my_payments() to mk_app;

-- The caller's own payouts.
create or replace function app.my_payouts()
returns table (
  id           uuid,
  amount_cents bigint,
  currency     char(3),
  status       text,
  created_at   timestamptz,
  updated_at   timestamptz
)
language sql stable security definer set search_path = app, pg_temp as $$
  select o.id, o.amount_cents, o.currency, o.status, o.created_at, o.updated_at
    from app.payouts o
   where o.creator_id = app.uid() and app.viewer_role() = 'creator'
   order by o.created_at desc
   limit 200
$$;
revoke all on function app.my_payouts() from public;
grant execute on function app.my_payouts() to mk_app;
