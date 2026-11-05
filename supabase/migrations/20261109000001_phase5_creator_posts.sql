-- Phase 5a: creator studio — posts.
-- Creators write their own posts (drafts, scheduled, published). Media stays
-- placeholder: the server generates the studies; clients never supply media.
-- Fans only ever see posts whose publish time has passed.

-- Draft = published_at IS NULL. Scheduled = published_at in the future.
alter table app.posts alter column published_at drop not null;
alter table app.posts alter column published_at drop default;
alter table app.posts add column created_at timestamptz not null default now();
alter table app.posts add column updated_at timestamptz not null default now();

-- ---------------------------------------------------------------- helpers
-- Does the viewer own this post? (Definer: policies on post_content must not
-- depend on RLS-filtered subqueries.)
create function app.owns_post(p_post uuid) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select exists (select 1 from app.posts where id = p_post and creator_id = app.uid()) and app.viewer_role() = 'creator'
$$;

-- Whether anyone bought this post. Only the post's creator or the owner may ask.
create function app.post_has_purchases(p_post uuid) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select (app.is_owner() or exists (select 1 from app.posts where id = p_post and creator_id = app.uid()))
     and exists (select 1 from app.purchases where post_id = p_post)
$$;
revoke all on function app.owns_post(uuid), app.post_has_purchases(uuid) from public;
grant execute on function app.owns_post(uuid), app.post_has_purchases(uuid) to mk_app;

-- Unpublished posts are invisible and locked to everyone but their creator and the owner.
create or replace function app.can_view_post(p_post uuid) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select coalesce((
    select case
      when app.is_owner() then true
      when p.creator_id = app.uid() and app.is_active() then true
      when p.published_at is null or p.published_at > now() then false
      when p.hidden_at is not null then false
      when not app.can_see_creator(p.creator_id) then false
      when p.access = 'preview' then true
      when p.access = 'members' then app.has_active_sub(p.creator_id, false)
      when p.access = 'vip' then app.has_active_sub(p.creator_id, true)
      when p.access = 'ppv' then exists (select 1 from app.purchases x where x.post_id = p.id and x.fan_id = app.uid())
      else false
    end
    from app.posts p where p.id = p_post
  ), false)
$$;

drop policy posts_select on app.posts;
create policy posts_select on app.posts for select to mk_app
  using (
    app.can_see_creator(creator_id)
    and (app.is_owner() or creator_id = app.uid() or (hidden_at is null and published_at is not null and published_at <= now()))
  );

-- ---------------------------------------------------------------- creator writes
grant insert, delete on app.posts to mk_app;
grant update (access, price_cents, teaser, media_kind, media_count, published_at, updated_at) on app.posts to mk_app;

create policy posts_creator_insert on app.posts for insert to mk_app
  with check (creator_id = app.uid() and app.viewer_role() = 'creator' and hidden_at is null and hidden_reason is null);
create policy posts_creator_update on app.posts for update to mk_app
  using (creator_id = app.uid() and app.viewer_role() = 'creator')
  with check (creator_id = app.uid());
-- Bought posts can't be deleted (fans keep what they paid for).
create policy posts_creator_delete on app.posts for delete to mk_app
  using (creator_id = app.uid() and app.viewer_role() = 'creator' and not app.post_has_purchases(id));

grant insert, update (body, media), delete on app.post_content to mk_app;
create policy post_content_creator_insert on app.post_content for insert to mk_app with check (app.owns_post(post_id));
create policy post_content_creator_update on app.post_content for update to mk_app using (app.owns_post(post_id)) with check (app.owns_post(post_id));
create policy post_content_creator_delete on app.post_content for delete to mk_app using (app.owns_post(post_id));

-- Guard (SECURITY INVOKER so current_user is the caller):
--  * creators can't touch moderation columns or move a post to another creator;
--  * the owner may only moderate other creators' posts, never rewrite them;
--  * a bought post keeps its access level and publish time.
create function app.posts_guard() returns trigger language plpgsql set search_path = app, pg_temp as $$
begin
  if current_user <> 'mk_app' then return new; end if;
  if new.creator_id is distinct from old.creator_id then
    raise exception 'posts cannot change creator' using errcode = '42501';
  end if;
  if app.is_owner() and old.creator_id is distinct from app.uid() then
    if (new.access, new.price_cents, new.teaser, new.media_kind, new.media_count, new.published_at)
       is distinct from (old.access, old.price_cents, old.teaser, old.media_kind, old.media_count, old.published_at) then
      raise exception 'the owner moderates posts but does not edit them' using errcode = '42501';
    end if;
    return new;
  end if;
  if (new.hidden_at, new.hidden_reason) is distinct from (old.hidden_at, old.hidden_reason) then
    raise exception 'only the owner can moderate posts' using errcode = '42501';
  end if;
  if app.post_has_purchases(old.id)
     and (new.access is distinct from old.access or new.published_at is distinct from old.published_at) then
    raise exception 'a purchased post keeps its access level and stays published' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger posts_guard before update on app.posts for each row execute function app.posts_guard();
