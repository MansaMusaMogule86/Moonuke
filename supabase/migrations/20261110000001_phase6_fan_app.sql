-- Phase 6: fan app — subscription cancellation and the notification centre.
-- No payments, no new tracking. Entitlements are never written by mk_app;
-- cancellation goes through a narrow SECURITY DEFINER function.

-- ---------------------------------------------------------------- subscriptions: cancel at period end
-- Cancelling keeps access until current_period_end (nothing is refunded or
-- charged: payments are inactive). Status stays 'active' until the period
-- ends; has_active_sub() already stops access at current_period_end.
alter table app.subscriptions add column cancel_at_period_end boolean not null default false;
alter table app.subscriptions add column canceled_at timestamptz;

create function app.set_my_subscription_cancel(p_sub uuid, p_cancel boolean) returns boolean
language plpgsql volatile security definer set search_path = app, pg_temp as $$
declare n int;
begin
  if not app.is_active() then return false; end if;
  update app.subscriptions
     set cancel_at_period_end = p_cancel,
         canceled_at = case when p_cancel then now() else null end
   where id = p_sub and fan_id = app.uid() and status = 'active' and current_period_end > now()
     and cancel_at_period_end is distinct from p_cancel;
  get diagnostics n = row_count;
  return n = 1;
end $$;
revoke all on function app.set_my_subscription_cancel(uuid, boolean) from public;
grant execute on function app.set_my_subscription_cancel(uuid, boolean) to mk_app;

-- Purchase history: the buyer's own purchases with the entitlement as it
-- stands now. Reveals only booleans about posts the caller bought.
create function app.my_purchase_states()
returns table (id uuid, post_id uuid, created_at timestamptz, unlocked boolean, under_review boolean, creator_visible boolean)
language sql stable security definer set search_path = app, pg_temp as $$
  select x.id, x.post_id, x.created_at, app.can_view_post(x.post_id), (p.hidden_at is not null), app.can_see_creator(p.creator_id)
    from app.purchases x join app.posts p on p.id = x.post_id
   where x.fan_id = app.uid() and app.is_active()
$$;
revoke all on function app.my_purchase_states() from public;
grant execute on function app.my_purchase_states() to mk_app;

-- ---------------------------------------------------------------- notifications
-- Generic so Messaging and Blasts can reuse it later. Rows hold references
-- only (never locked content); everything shown is re-read under RLS.
create table app.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references app.users(id) on delete cascade,
  kind         text not null check (kind in ('post.published', 'proposal.received', 'message.received', 'blast.received', 'system')),
  creator_id   uuid references app.creators(user_id) on delete cascade,
  post_id      uuid references app.posts(id) on delete cascade,
  -- Short, non-sensitive extras for future kinds (never message bodies).
  data         jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 2000),
  -- Scheduled posts notify when they go live, not when they're scheduled.
  available_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  read_at      timestamptz,
  unique (user_id, kind, post_id)
);
create index notifications_inbox on app.notifications (user_id, available_at desc);
create index notifications_unread on app.notifications (user_id) where read_at is null;
alter table app.notifications enable row level security;

-- Readers see only their own, only once available. A notification about a
-- post is also hidden whenever the post itself is not visible to them
-- (deleted, unpublished, hidden by the house, blocked, profile not live).
create function app.post_is_live(p_post uuid) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select exists (select 1 from app.posts where id = p_post and hidden_at is null and published_at is not null and published_at <= now())
$$;
revoke all on function app.post_is_live(uuid) from public;
grant execute on function app.post_is_live(uuid) to mk_app;

grant select on app.notifications to mk_app;
grant update (read_at) on app.notifications to mk_app;
create policy notifications_select on app.notifications for select to mk_app
  using (user_id = app.uid() and available_at <= now()
         and (creator_id is null or app.can_see_creator(creator_id))
         and (post_id is null or app.post_is_live(post_id)));
create policy notifications_mark_read on app.notifications for update to mk_app
  using (user_id = app.uid()) with check (user_id = app.uid());
-- No insert/delete for mk_app: notifications are created by the database
-- (triggers below) or by system() for future kinds.

-- Fan-out when a post becomes (or is scheduled to become) published.
-- Recipients: followers and active subscribers at that moment, never the
-- creator, never anyone blocked either way. Re-scheduling moves the
-- notification; un-publishing removes unread ones.
create function app.notify_post_published() returns trigger
language plpgsql security definer set search_path = app, pg_temp as $$
begin
  if tg_op = 'UPDATE' and new.published_at is not distinct from old.published_at then return new; end if;
  if tg_op = 'UPDATE' then
    delete from app.notifications where post_id = new.id and kind = 'post.published' and read_at is null;
  end if;
  if new.published_at is null or new.hidden_at is not null then return new; end if;
  -- Editing an old post's publish time back to the past doesn't re-announce it.
  if new.published_at < now() - interval '1 day' then return new; end if;
  insert into app.notifications (user_id, kind, creator_id, post_id, available_at)
  select r.fan_id, 'post.published', new.creator_id, new.id, greatest(new.published_at, now())
    from (
      select f.fan_id from app.follows f where f.creator_id = new.creator_id
      union
      select s.fan_id from app.subscriptions s
       where s.creator_id = new.creator_id and s.status = 'active' and s.current_period_end > now()
    ) r
    join app.users u on u.id = r.fan_id and u.status = 'active'
   where r.fan_id <> new.creator_id
     and not exists (
       select 1 from app.blocks b
        where (b.blocker_id = r.fan_id and b.blocked_id = new.creator_id)
           or (b.blocker_id = new.creator_id and b.blocked_id = r.fan_id))
  on conflict (user_id, kind, post_id) do nothing;
  return new;
end $$;
create trigger posts_notify after insert or update of published_at on app.posts
  for each row execute function app.notify_post_published();

-- The creator hears about a house (or import) proposal waiting for them.
create function app.notify_proposal() returns trigger
language plpgsql security definer set search_path = app, pg_temp as $$
begin
  if new.status = 'proposed' and new.author_id is distinct from new.user_id then
    insert into app.notifications (user_id, kind, data) values (new.user_id, 'proposal.received', jsonb_build_object('source', new.source));
  end if;
  return new;
end $$;
create trigger proposals_notify after insert on app.profile_proposals
  for each row execute function app.notify_proposal();

revoke all on function app.notify_post_published(), app.notify_proposal() from public;
