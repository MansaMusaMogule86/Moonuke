-- Phase 5c: creator studio — analytics from EXISTING data only.
-- No new tracking: no view counts, no fan identities. Creators already read
-- their own subscriptions and follows under RLS; purchases are not readable
-- to creators, so unlock counts come from this aggregate-only helper.

create function app.my_post_unlocks() returns table (post_id uuid, unlocks int)
language sql stable security definer set search_path = app, pg_temp as $$
  select p.id, count(x.*)::int
    from app.posts p left join app.purchases x on x.post_id = p.id
   where p.creator_id = app.uid() and app.viewer_role() = 'creator' and p.access = 'ppv'
   group by p.id
$$;
revoke all on function app.my_post_unlocks() from public;
grant execute on function app.my_post_unlocks() to mk_app;
