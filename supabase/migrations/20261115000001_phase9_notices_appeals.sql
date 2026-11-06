-- =====================================================================
-- Phase 9 · Statements of reasons and appeals for creators
-- When the house restricts a creator's content (takedown removal, review
-- rejection, moderation removal, participant verification revoked, consent
-- withdrawn by the house), the creator receives a statement of reasons and
-- can appeal once per decision. The owner decides appeals.
-- Nothing is issued while the content is under a safeguarding legal hold.
-- =====================================================================

create table app.moderation_notices (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references app.users(id) on delete restrict,
  kind           text not null check (kind in ('takedown_removed', 'review_rejected', 'moderation_removed', 'verification_revoked', 'consent_withdrawn')),
  post_id        uuid references app.posts(id) on delete set null,
  participant_id uuid references app.participants(id) on delete restrict,
  source_type    text not null check (source_type in ('takedown', 'review', 'report', 'participant', 'consent')),
  source_id      uuid,
  -- Decision, facts, ground, whether automated, and redress (structured, shown verbatim).
  statement      jsonb not null check (pg_column_size(statement) <= 8192),
  automated      boolean not null default false,
  appeal_until   timestamptz not null,
  issued_by      uuid references app.users(id),
  created_at     timestamptz not null default now(),
  read_at        timestamptz,
  check (appeal_until > created_at)
);
create index moderation_notices_user on app.moderation_notices (user_id, created_at desc);
create unique index moderation_notices_once on app.moderation_notices (kind, source_id, coalesce(post_id, participant_id)) where source_id is not null;
alter table app.moderation_notices enable row level security;

create table app.decision_appeals (
  id            uuid primary key default gen_random_uuid(),
  notice_id     uuid not null unique references app.moderation_notices(id) on delete restrict,
  user_id       uuid not null references app.users(id) on delete restrict,
  body          text not null check (char_length(body) between 10 and 2000),
  status        text not null default 'open' check (status in ('open', 'upheld', 'overturned')),
  decision_note text check (char_length(decision_note) <= 1000),
  decided_by    uuid references app.users(id),
  decided_at    timestamptz,
  created_at    timestamptz not null default now(),
  check ((status = 'open') = (decided_at is null))
);
create index decision_appeals_open on app.decision_appeals (created_at) where status = 'open';
alter table app.decision_appeals enable row level security;

-- Notices: the recipient reads their own and marks them read; the owner issues and reads all.
grant select, insert (id, user_id, kind, post_id, participant_id, source_type, source_id, statement, automated, appeal_until, issued_by),
      update (read_at) on app.moderation_notices to mk_app;
create policy notices_select on app.moderation_notices for select to mk_app using (user_id = app.uid() or app.is_owner());
create policy notices_issue on app.moderation_notices for insert to mk_app with check (app.is_owner() and issued_by = app.uid() and user_id <> app.uid());
create policy notices_read on app.moderation_notices for update to mk_app using (user_id = app.uid()) with check (user_id = app.uid());

-- Only read_at may change, and only once.
create function app.moderation_notices_guard() returns trigger language plpgsql set search_path = app, pg_temp as $$
begin
  if tg_op = 'DELETE' then raise exception 'notices are never deleted' using errcode = '42501'; end if;
  if current_user <> 'mk_app' then return new; end if;
  if (new.user_id, new.kind, new.post_id, new.participant_id, new.source_type, new.source_id, new.statement, new.automated, new.appeal_until, new.issued_by, new.created_at)
     is distinct from (old.user_id, old.kind, old.post_id, old.participant_id, old.source_type, old.source_id, old.statement, old.automated, old.appeal_until, old.issued_by, old.created_at)
     or (old.read_at is not null and new.read_at is distinct from old.read_at) then
    raise exception 'notices are immutable' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger moderation_notices_guard before update or delete on app.moderation_notices
  for each row execute function app.moderation_notices_guard();

-- Appeals: filed through a definer function (own notice, within the window,
-- once); decided by the owner under RLS; a decision is final.
create function app.file_decision_appeal(p_notice uuid, p_body text) returns uuid
language plpgsql security definer set search_path = app, pg_temp as $$
declare v uuid; n app.moderation_notices;
begin
  select * into n from app.moderation_notices where id = p_notice and user_id = app.uid() and app.is_active();
  if n.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if n.appeal_until < now() then raise exception 'the appeal window has closed' using errcode = '22023'; end if;
  if char_length(trim(p_body)) < 10 then raise exception 'explain your appeal in at least 10 characters' using errcode = '22023'; end if;
  insert into app.decision_appeals (notice_id, user_id, body) values (p_notice, app.uid(), trim(p_body)) returning id into v;
  insert into app.audit_log (actor_id, action, target_type, target_id, metadata)
  values (app.uid(), 'appeal.file', 'notice', p_notice, jsonb_build_object('appeal', v));
  return v;
exception when unique_violation then
  raise exception 'you have already appealed this decision' using errcode = '23505';
end $$;
revoke all on function app.file_decision_appeal(uuid, text) from public;
grant execute on function app.file_decision_appeal(uuid, text) to mk_app;

grant select, update (status, decision_note, decided_by, decided_at) on app.decision_appeals to mk_app;
create policy appeals_select on app.decision_appeals for select to mk_app using (user_id = app.uid() or app.is_owner());
create policy appeals_decide on app.decision_appeals for update to mk_app using (app.is_owner()) with check (app.is_owner() and decided_by = app.uid());

create function app.decision_appeals_guard() returns trigger language plpgsql set search_path = app, pg_temp as $$
begin
  if tg_op = 'DELETE' then raise exception 'appeals are never deleted' using errcode = '42501'; end if;
  if current_user <> 'mk_app' then return new; end if;
  if old.status <> 'open' then raise exception 'appeal already decided' using errcode = '42501'; end if;
  if (new.notice_id, new.user_id, new.body, new.created_at) is distinct from (old.notice_id, old.user_id, old.body, old.created_at) then
    raise exception 'appeals are immutable' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger decision_appeals_guard before update or delete on app.decision_appeals
  for each row execute function app.decision_appeals_guard();

-- Overturn helpers (owner only).
create function app.overturn_review(p_post uuid) returns void
language plpgsql security definer set search_path = app, pg_temp as $$
begin
  if not app.is_owner() then raise exception 'not allowed' using errcode = '42501'; end if;
  update app.posts set review_state = 'approved', reviewed_by = app.uid(), reviewed_at = now(),
         review_note = 'Approved on appeal'
   where id = p_post and review_state = 'rejected';
  if not found then raise exception 'not rejected' using errcode = 'P0002'; end if;
end $$;

create function app.restore_participant(p_id uuid) returns int
language plpgsql security definer set search_path = app, pg_temp as $$
declare n int;
begin
  if not app.is_owner() then raise exception 'not allowed' using errcode = '42501'; end if;
  update app.participants set status = 'verified', review_note = 'Restored on appeal', reviewed_by = app.uid(), reviewed_at = now()
   where id = p_id and status = 'revoked';
  if not found then raise exception 'not revoked' using errcode = 'P0002'; end if;
  -- Unhide only posts hidden by the revocation whose people are all valid again.
  with u as (
    update app.posts set hidden_at = null, hidden_reason = null
     where hidden_reason = 'Participant verification revoked'
       and id in (select post_id from app.post_participants where participant_id = p_id)
       and app.post_participants_valid(id)
       and not app.under_hold('post', id)
    returning id
  ) select count(*) into n from u;
  return n;
end $$;
revoke all on function app.overturn_review(uuid), app.restore_participant(uuid) from public;
grant execute on function app.overturn_review(uuid), app.restore_participant(uuid) to mk_app;

-- An overturned takedown lifts that notice's fingerprint blocks.
grant delete on app.blocked_media_hashes to mk_app;
create policy blocked_hashes_owner_delete on app.blocked_media_hashes for delete to mk_app using (app.is_owner());

-- Owner lookup of who a participant record belongs to (participant tables have no viewer grants).
create function app.participant_ref(p_participant uuid, p_consent uuid)
returns table (participant_id uuid, creator_id uuid, label text)
language sql stable security definer set search_path = app, pg_temp as $$
  select p.id, p.creator_id, p.label from app.participants p
   where app.is_owner()
     and (p.id = p_participant or p.id = (select c.participant_id from app.participant_consents c where c.id = p_consent))
$$;
revoke all on function app.participant_ref(uuid, uuid) from public;
grant execute on function app.participant_ref(uuid, uuid) to mk_app;
