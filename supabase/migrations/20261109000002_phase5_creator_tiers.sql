-- Phase 5b: creator studio — membership tiers.
-- Creators manage their own tiers. Payments stay inactive; prices are quoted
-- by the server only. Entitlements depend on tier kind, so a tier that has
-- ever had a subscriber keeps its kind and can't be deleted (deactivate it).

create function app.tier_has_subscribers(p_tier uuid) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select exists (
    select 1 from app.tiers t
     where t.id = p_tier and (t.creator_id = app.uid() or app.is_owner())
  ) and exists (select 1 from app.subscriptions s where s.tier_id = p_tier)
$$;
revoke all on function app.tier_has_subscribers(uuid) from public;
grant execute on function app.tier_has_subscribers(uuid) to mk_app;

grant insert, delete on app.tiers to mk_app;
grant update (name, price_cents, perks, seat_limit, active, sort, kind) on app.tiers to mk_app;

create policy tiers_creator_insert on app.tiers for insert to mk_app
  with check (creator_id = app.uid() and app.viewer_role() = 'creator');
create policy tiers_creator_update on app.tiers for update to mk_app
  using (creator_id = app.uid() and app.viewer_role() = 'creator')
  with check (creator_id = app.uid());
create policy tiers_creator_delete on app.tiers for delete to mk_app
  using (creator_id = app.uid() and app.viewer_role() = 'creator' and not app.tier_has_subscribers(id));

-- Guard (SECURITY INVOKER): tiers stay with their creator; a subscribed tier
-- keeps its kind; seats can't drop below current active subscribers.
create function app.tiers_guard() returns trigger language plpgsql set search_path = app, pg_temp as $$
declare taken int;
begin
  if current_user <> 'mk_app' then return new; end if;
  if new.creator_id is distinct from old.creator_id then
    raise exception 'tiers cannot change creator' using errcode = '42501';
  end if;
  if new.kind is distinct from old.kind and app.tier_has_subscribers(old.id) then
    raise exception 'a tier with members keeps its kind' using errcode = '42501';
  end if;
  if new.seat_limit is not null and new.seat_limit is distinct from old.seat_limit then
    taken := coalesce(app.tier_seats_taken(old.id), 0); -- definer: subscriptions are RLS-filtered for creators
    if new.seat_limit < taken then
      raise exception 'seat limit below current members' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger tiers_guard before update on app.tiers for each row execute function app.tiers_guard();
