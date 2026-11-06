-- =====================================================================
-- Phase 11 · Restricted moderator role (INACTIVE)
-- A moderator is an active MEMBER account (never a creator or the owner)
-- holding a staff grant with a strict subset of capabilities. A capability
-- is effective only when ALL hold:
--   1. FEATURE_MODERATORS=on in the server (production refuses it),
--   2. safety_settings.moderators_enabled = true (owner switch, default off),
--   3. an unrevoked grant naming the capability,
--   4. the session is AAL2 (two-step sign-in).
-- Owner-only powers are never delegable: suspensions, safeguarding, identity
-- and requester-contact reveal, exceptional access, settings, rules, grants.
-- Moderators never act on reports they filed or that concern themselves.
-- =====================================================================

alter table app.safety_settings add column moderators_enabled boolean not null default false;

create table app.staff_grants (
  user_id       uuid primary key references app.users(id) on delete restrict,
  capabilities  text[] not null check (
                  cardinality(capabilities) between 1 and 6
                  and capabilities <@ array['reports.view', 'reports.decide', 'content.hide', 'review.decide', 'takedowns.decide', 'appeals.decide']),
  note          text check (char_length(note) <= 300),
  granted_by    uuid not null references app.users(id),
  granted_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  revoked_by    uuid references app.users(id),
  revoke_reason text check (char_length(revoke_reason) <= 300)
);
alter table app.staff_grants enable row level security;
grant select on app.staff_grants to mk_app;
create policy staff_grants_select on app.staff_grants for select to mk_app using (app.is_owner() or user_id = app.uid());
-- Writes go through the owner functions below.

create function app.has_capability(p_cap text) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select coalesce(current_setting('app.aal', true), '1') = '2'
     and coalesce((select moderators_enabled from app.safety_settings where id), false)
     and exists (
       select 1 from app.staff_grants g join app.users u on u.id = g.user_id
        where g.user_id = app.uid() and g.revoked_at is null and p_cap = any (g.capabilities)
          and u.status = 'active' and u.role = 'member')
$$;
revoke all on function app.has_capability(text) from public;
grant execute on function app.has_capability(text) to mk_app;

create function app.staff_can_moderate_posts() returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select app.has_capability('content.hide') or app.has_capability('takedowns.decide')
$$;
create function app.staff_can_see_posts() returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select app.has_capability('review.decide') or app.has_capability('content.hide') or app.has_capability('takedowns.decide')
      or app.has_capability('reports.view') or app.has_capability('appeals.decide')
$$;
revoke all on function app.staff_can_moderate_posts(), app.staff_can_see_posts() from public;
grant execute on function app.staff_can_moderate_posts(), app.staff_can_see_posts() to mk_app;

create function app.moderators_enabled() returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select moderators_enabled from app.safety_settings where id
$$;
revoke all on function app.moderators_enabled() from public;
grant execute on function app.moderators_enabled() to mk_app;

-- Owner functions (audited): grant, revoke, switch.
create function app.grant_staff(p_user uuid, p_caps text[], p_note text) returns void
language plpgsql security definer set search_path = app, pg_temp as $$
begin
  if not app.is_owner() then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from app.users u join app.mfa_factors f on f.user_id = u.id
                  where u.id = p_user and u.role = 'member' and u.status = 'active' and f.confirmed_at is not null) then
    raise exception 'moderators must be active members with two-step sign-in set up' using errcode = '22023';
  end if;
  insert into app.staff_grants (user_id, capabilities, note, granted_by) values (p_user, p_caps, nullif(trim(p_note), ''), app.uid())
  on conflict (user_id) do update set capabilities = excluded.capabilities, note = excluded.note, granted_by = excluded.granted_by,
    granted_at = now(), revoked_at = null, revoked_by = null, revoke_reason = null;
  insert into app.audit_log (actor_id, action, target_type, target_id, metadata)
  values (app.uid(), 'staff.grant', 'user', p_user, jsonb_build_object('capabilities', p_caps));
end $$;

create function app.revoke_staff(p_user uuid, p_reason text) returns void
language plpgsql security definer set search_path = app, pg_temp as $$
begin
  if not app.is_owner() then raise exception 'not allowed' using errcode = '42501'; end if;
  update app.staff_grants set revoked_at = now(), revoked_by = app.uid(), revoke_reason = nullif(trim(p_reason), '')
   where user_id = p_user and revoked_at is null;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  insert into app.audit_log (actor_id, action, target_type, target_id, metadata)
  values (app.uid(), 'staff.revoke', 'user', p_user, '{}'::jsonb);
end $$;

create function app.set_moderators_enabled(p_on boolean) returns void
language plpgsql security definer set search_path = app, pg_temp as $$
begin
  if not app.is_owner() then raise exception 'not allowed' using errcode = '42501'; end if;
  update app.safety_settings set moderators_enabled = p_on, updated_by = app.uid(), updated_at = now() where id;
  insert into app.audit_log (actor_id, action, target_type, metadata)
  values (app.uid(), 'staff.switch', 'settings', jsonb_build_object('enabled', p_on));
end $$;
revoke all on function app.grant_staff(uuid, text[], text), app.revoke_staff(uuid, text), app.set_moderators_enabled(boolean) from public;
grant execute on function app.grant_staff(uuid, text[], text), app.revoke_staff(uuid, text), app.set_moderators_enabled(boolean) to mk_app;

-- ---------------------------------------------------------------------
-- Posts: staff with a moderation capability may hide/restore (not edit) and
-- see posts needed for review; owner rules are unchanged.
-- ---------------------------------------------------------------------
create or replace function app.posts_guard() returns trigger language plpgsql set search_path = app, pg_temp as $$
begin
  if current_user <> 'mk_app' then return new; end if;
  if new.creator_id is distinct from old.creator_id then
    raise exception 'posts cannot change creator' using errcode = '42501';
  end if;
  if (app.is_owner() or app.staff_can_moderate_posts()) and old.creator_id is distinct from app.uid() then
    if (new.access, new.price_cents, new.teaser, new.media_kind, new.media_count, new.published_at)
       is distinct from (old.access, old.price_cents, old.teaser, old.media_kind, old.media_count, old.published_at) then
      raise exception 'moderators moderate posts but do not edit them' using errcode = '42501';
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

create policy posts_staff_moderate on app.posts for update to mk_app
  using (app.staff_can_moderate_posts()) with check (app.staff_can_moderate_posts());

drop policy posts_select on app.posts;
create policy posts_select on app.posts for select to mk_app
  using (
    (app.can_see_creator(creator_id)
     and (app.is_owner() or creator_id = app.uid()
          or (hidden_at is null and published_at is not null and published_at <= now() and app.post_review_ok(review_state))))
    or app.staff_can_see_posts()
  );

-- Reviewers and takedown staff need the gated half (body, media) to decide.
create or replace function app.can_view_post(p_post uuid) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select coalesce((
    select case
      when app.is_owner() then true
      when app.has_capability('review.decide') or app.has_capability('takedowns.decide') then true
      when p.creator_id = app.uid() and app.is_active() then true
      when p.published_at is null or p.published_at > now() then false
      when p.hidden_at is not null then false
      when not app.post_review_ok(p.review_state) then false
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

create or replace function app.decide_post_review(p_post uuid, p_approve boolean, p_note text) returns text
language plpgsql security definer set search_path = app, pg_temp as $$
declare s text;
begin
  if not (app.is_owner() or app.has_capability('review.decide')) then raise exception 'not allowed' using errcode = '42501'; end if;
  if not p_approve and coalesce(char_length(trim(p_note)), 0) < 5 then
    raise exception 'a rejection needs a note for the creator' using errcode = '22023';
  end if;
  update app.posts set review_state = case when p_approve then 'approved' else 'rejected' end,
         review_note = nullif(trim(p_note), ''), reviewed_by = app.uid(), reviewed_at = now()
   where id = p_post and review_state = 'pending'
  returning review_state into s;
  if s is null then raise exception 'not pending' using errcode = 'P0002'; end if;
  insert into app.audit_log (actor_id, action, target_type, target_id, metadata)
  values (app.uid(), 'review.' || case when p_approve then 'approve' else 'reject' end, 'post', p_post, '{}'::jsonb);
  return s;
end $$;

create or replace function app.overturn_review(p_post uuid) returns void
language plpgsql security definer set search_path = app, pg_temp as $$
begin
  if not (app.is_owner() or app.has_capability('appeals.decide')) then raise exception 'not allowed' using errcode = '42501'; end if;
  -- Nobody overturns their own review decision.
  if exists (select 1 from app.posts where id = p_post and reviewed_by = app.uid()) and not app.is_owner() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update app.posts set review_state = 'approved', reviewed_by = app.uid(), reviewed_at = now(),
         review_note = 'Approved on appeal'
   where id = p_post and review_state = 'rejected';
  if not found then raise exception 'not rejected' using errcode = 'P0002'; end if;
end $$;

-- ---------------------------------------------------------------------
-- Reports and the moderation log: never one's own reports, or reports about oneself.
-- ---------------------------------------------------------------------
create policy reports_staff_select on app.reports for select to mk_app
  using (app.has_capability('reports.view') and reporter_id <> app.uid() and target_user_id is distinct from app.uid());
create policy reports_staff_update on app.reports for update to mk_app
  using ((app.has_capability('reports.decide') or app.has_capability('content.hide')) and reporter_id <> app.uid() and target_user_id is distinct from app.uid())
  with check ((app.has_capability('reports.decide') or app.has_capability('content.hide')) and reporter_id <> app.uid() and target_user_id is distinct from app.uid());
create policy modactions_staff_select on app.moderation_actions for select to mk_app
  using (app.has_capability('reports.view'));
create policy modactions_staff_insert on app.moderation_actions for insert to mk_app
  with check ((app.has_capability('reports.decide') or app.has_capability('content.hide') or app.has_capability('takedowns.decide')) and actor_id = app.uid());

-- Takedowns: decide, but the encrypted requester contact is revealed by the owner only (app layer).
create policy takedown_staff_select on app.takedown_notices for select to mk_app using (app.has_capability('takedowns.decide'));
create policy takedown_staff_update on app.takedown_notices for update to mk_app
  using (app.has_capability('takedowns.decide')) with check (app.has_capability('takedowns.decide'));
create policy blocked_hashes_staff_select on app.blocked_media_hashes for select to mk_app using (app.has_capability('takedowns.decide'));
create policy blocked_hashes_staff_insert on app.blocked_media_hashes for insert to mk_app with check (app.has_capability('takedowns.decide'));
create policy blocked_hashes_staff_delete on app.blocked_media_hashes for delete to mk_app using (app.has_capability('appeals.decide'));

-- Notices: staff decisions issue them too. Appeals: never on a decision you issued.
create function app.notice_issuer(p_notice uuid) returns uuid
language sql stable security definer set search_path = app, pg_temp as $$
  select issued_by from app.moderation_notices where id = p_notice
$$;
revoke all on function app.notice_issuer(uuid) from public;
grant execute on function app.notice_issuer(uuid) to mk_app;

drop policy notices_issue on app.moderation_notices;
create policy notices_issue on app.moderation_notices for insert to mk_app
  with check ((app.is_owner() or app.has_capability('review.decide') or app.has_capability('content.hide') or app.has_capability('takedowns.decide'))
              and issued_by = app.uid() and user_id <> app.uid());
-- Staff read notices they issued (needed for INSERT ... RETURNING) and, with appeals.decide, all notices.
create policy notices_staff_select on app.moderation_notices for select to mk_app
  using (app.has_capability('appeals.decide') or (issued_by = app.uid() and app.staff_can_see_posts()));
create policy appeals_staff_select on app.decision_appeals for select to mk_app using (app.has_capability('appeals.decide'));
create policy appeals_staff_decide on app.decision_appeals for update to mk_app
  using (app.has_capability('appeals.decide') and app.notice_issuer(notice_id) is distinct from app.uid())
  with check (app.has_capability('appeals.decide') and decided_by = app.uid() and app.notice_issuer(notice_id) is distinct from app.uid());

-- The moderation log of staff actions for the owner is the audit log itself (owner-readable).
