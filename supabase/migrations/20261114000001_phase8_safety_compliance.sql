-- =====================================================================
-- Phase 8 · Safety and compliance
--   1. Public takedown notices (non-members), with a 48-hour clock,
--      deduplication and removal of known identical copies.
--   2. Pre-publication review of posts (flagged posts, or all posts when
--      the owner switches the mode on).
--   3. Participant identity, age and consent records (encrypted at rest by
--      the app; no identity documents are stored here).
--   4. Safeguarding cases: urgent escalation, NCMEC report preparation
--      (manual submission only) and legal holds that block deletion.
--
-- mk_app has NO direct grants on any table below. Every read and write goes
-- through SECURITY DEFINER functions that check the caller, or through the
-- server's system() role after app-layer authorization.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Shared: media fingerprints (sha256 of each media element) and a list of
-- fingerprints that may never be published again.
-- ---------------------------------------------------------------------
create function app.media_hashes(p_media jsonb) returns text[]
language sql immutable set search_path = app, pg_temp as $$
  select coalesce(array_agg(encode(sha256(convert_to(e::text, 'UTF8')), 'hex') order by e::text), '{}')
    from jsonb_array_elements(coalesce(p_media, '[]'::jsonb)) e
$$;
revoke all on function app.media_hashes(jsonb) from public;
grant execute on function app.media_hashes(jsonb) to mk_app;
create index post_content_media_hashes on app.post_content using gin (app.media_hashes(media));

create table app.blocked_media_hashes (
  hash        text primary key check (hash ~ '^[0-9a-f]{64}$'),
  reason      text not null check (reason in ('takedown', 'safeguarding', 'consent_withdrawn')),
  source_type text not null check (source_type in ('takedown', 'safeguarding', 'consent')),
  source_id   uuid not null,
  created_at  timestamptz not null default now()
);
alter table app.blocked_media_hashes enable row level security;

-- Refuse content whose media matches a blocked fingerprint (applies to every role).
create function app.media_is_blocked(p_media jsonb) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select exists (select 1 from app.blocked_media_hashes b where b.hash = any (app.media_hashes(p_media)))
$$;
revoke all on function app.media_is_blocked(jsonb) from public;
grant execute on function app.media_is_blocked(jsonb) to mk_app;

create function app.post_content_media_guard() returns trigger language plpgsql set search_path = app, pg_temp as $$
begin
  if (tg_op = 'INSERT' or new.media is distinct from old.media) and app.media_is_blocked(new.media) then
    raise exception 'blocked media' using errcode = 'P0001', hint = 'blocked_media';
  end if;
  return new;
end $$;
create trigger post_content_media_guard before insert or update on app.post_content
  for each row execute function app.post_content_media_guard();

-- ---------------------------------------------------------------------
-- 2. Pre-publication review
-- ---------------------------------------------------------------------
create table app.safety_settings (
  id          boolean primary key default true check (id),
  -- 'flagged': only flagged posts wait for review (posts naming other participants).
  -- 'all': every newly created or edited post waits for review.
  review_mode text not null default 'flagged' check (review_mode in ('flagged', 'all')),
  updated_by  uuid references app.users(id),
  updated_at  timestamptz not null default now()
);
insert into app.safety_settings default values;
alter table app.safety_settings enable row level security;

create function app.review_mode() returns text
language sql stable security definer set search_path = app, pg_temp as $$
  select review_mode from app.safety_settings where id
$$;
revoke all on function app.review_mode() from public;
grant execute on function app.review_mode() to mk_app;

alter table app.posts
  add column review_state text not null default 'not_required'
    check (review_state in ('not_required', 'pending', 'approved', 'rejected')),
  add column review_reasons text[] not null default '{}',
  add column review_note text check (char_length(review_note) <= 500),
  add column reviewed_by uuid references app.users(id),
  add column reviewed_at timestamptz;
create index posts_review_queue on app.posts (updated_at) where review_state = 'pending';

-- Viewers (mk_app) can never set review columns. Inserts start unreviewed
-- (or pending in 'all' mode); a creator's edit of a post that needed review
-- sends it back to the queue. SECURITY INVOKER: current_user is the caller.
create function app.posts_review_guard() returns trigger language plpgsql set search_path = app, pg_temp as $$
begin
  if current_user <> 'mk_app' then return new; end if;
  if tg_op = 'INSERT' then
    new.review_note := null; new.reviewed_by := null; new.reviewed_at := null;
    if app.review_mode() = 'all' then
      new.review_state := 'pending'; new.review_reasons := array['all_content'];
    else
      new.review_state := 'not_required'; new.review_reasons := '{}';
    end if;
    return new;
  end if;
  if (new.review_state, new.review_reasons, new.review_note, new.reviewed_by, new.reviewed_at)
     is distinct from (old.review_state, old.review_reasons, old.review_note, old.reviewed_by, old.reviewed_at) then
    raise exception 'review state is set by the house' using errcode = '42501';
  end if;
  if old.creator_id = app.uid()
     and (new.access, new.price_cents, new.teaser, new.media_kind, new.media_count)
         is distinct from (old.access, old.price_cents, old.teaser, old.media_kind, old.media_count)
     and (old.review_state <> 'not_required' or app.review_mode() = 'all') then
    new.review_state := 'pending';
    new.review_reasons := (select array_agg(distinct r) from unnest(old.review_reasons || array['edited']) r);
    new.reviewed_by := null; new.reviewed_at := null;
  end if;
  return new;
end $$;
create trigger posts_review_guard before insert or update on app.posts for each row execute function app.posts_review_guard();

-- Body or media edits by the creator also re-queue a reviewed post.
create function app.requeue_post_review(p_post uuid) returns void
language sql security definer set search_path = app, pg_temp as $$
  update app.posts set review_state = 'pending',
         review_reasons = (select array_agg(distinct r) from unnest(review_reasons || array['edited']) r),
         reviewed_by = null, reviewed_at = null
   where id = p_post and creator_id = app.uid()
     and (review_state <> 'not_required' or app.review_mode() = 'all')
$$;
revoke all on function app.requeue_post_review(uuid) from public;

create function app.post_content_review_requeue() returns trigger language plpgsql set search_path = app, pg_temp as $$
begin
  if current_user = 'mk_app' and (new.body, new.media) is distinct from (old.body, old.media) then
    perform app.requeue_post_review(new.post_id);
  end if;
  return new;
end $$;
-- Runs as the caller, but needs to update posts.review_state: allowed only via the definer helper.
grant execute on function app.requeue_post_review(uuid) to mk_app;
create trigger post_content_review_requeue after update on app.post_content
  for each row execute function app.post_content_review_requeue();

create function app.post_review_ok(p_state text) returns boolean
language sql immutable set search_path = app, pg_temp as $$
  select p_state in ('not_required', 'approved')
$$;
revoke all on function app.post_review_ok(text) from public;
grant execute on function app.post_review_ok(text) to mk_app;

-- Unreviewed or rejected posts are invisible and locked to everyone but their creator and the owner.
create or replace function app.can_view_post(p_post uuid) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select coalesce((
    select case
      when app.is_owner() then true
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

drop policy posts_select on app.posts;
create policy posts_select on app.posts for select to mk_app
  using (
    app.can_see_creator(creator_id)
    and (app.is_owner() or creator_id = app.uid()
         or (hidden_at is null and published_at is not null and published_at <= now() and app.post_review_ok(review_state)))
  );

create or replace function app.post_is_live(p_post uuid) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select exists (select 1 from app.posts where id = p_post and hidden_at is null and published_at is not null
                   and published_at <= now() and app.post_review_ok(review_state))
$$;

-- Owner decision on a pending post. Approve makes it visible (if published); reject keeps it hidden.
create function app.decide_post_review(p_post uuid, p_approve boolean, p_note text) returns text
language plpgsql security definer set search_path = app, pg_temp as $$
declare s text;
begin
  if not app.is_owner() then raise exception 'not allowed' using errcode = '42501'; end if;
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
revoke all on function app.decide_post_review(uuid, boolean, text) from public;
grant execute on function app.decide_post_review(uuid, boolean, text) to mk_app;

create function app.set_review_mode(p_mode text) returns void
language plpgsql security definer set search_path = app, pg_temp as $$
begin
  if not app.is_owner() then raise exception 'not allowed' using errcode = '42501'; end if;
  update app.safety_settings set review_mode = p_mode, updated_by = app.uid(), updated_at = now() where id;
  insert into app.audit_log (actor_id, action, target_type, metadata)
  values (app.uid(), 'review.mode', 'settings', jsonb_build_object('mode', p_mode));
end $$;
revoke all on function app.set_review_mode(text) from public;
grant execute on function app.set_review_mode(text) to mk_app;

-- ---------------------------------------------------------------------
-- 3. Participants, age and consent
-- Identity details (legal name, date of birth) are AES-256-GCM encrypted by
-- the server before they reach the database. No document images are stored;
-- `evidence_ref` may later point to a private object (uploads are disabled).
-- ---------------------------------------------------------------------
create table app.participants (
  id                  uuid primary key default gen_random_uuid(),
  creator_id          uuid not null references app.creators(user_id) on delete restrict,
  label               text not null check (char_length(label) between 1 and 60),
  identity_enc        text not null check (char_length(identity_enc) <= 4000),
  -- The server refuses anyone under 18 before anything is stored.
  adult_attested      boolean not null check (adult_attested),
  status              text not null default 'pending' check (status in ('pending', 'verified', 'rejected', 'revoked')),
  method              text not null default 'house_manual' check (method in ('house_manual', 'vendor')),
  evidence_ref        text check (char_length(evidence_ref) <= 200),
  evidence_sha256     text check (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  review_note         text check (char_length(review_note) <= 500),
  reviewed_by         uuid references app.users(id),
  reviewed_at         timestamptz,
  created_at          timestamptz not null default now()
);
create index participants_creator on app.participants (creator_id, created_at desc);
create index participants_pending on app.participants (created_at) where status = 'pending';

create table app.participant_consents (
  id                uuid primary key default gen_random_uuid(),
  participant_id    uuid not null references app.participants(id) on delete restrict,
  scope             text not null check (char_length(scope) between 3 and 500),
  signed_on         date not null,
  signature_enc     text not null check (char_length(signature_enc) <= 2000),
  recorded_by       uuid not null references app.users(id),
  created_at        timestamptz not null default now(),
  withdrawn_at      timestamptz,
  withdrawn_by      uuid references app.users(id),
  withdrawal_reason text check (char_length(withdrawal_reason) <= 500)
);
create index consents_participant on app.participant_consents (participant_id);

create table app.post_participants (
  post_id        uuid not null references app.posts(id) on delete cascade,
  participant_id uuid not null references app.participants(id) on delete restrict,
  consent_id     uuid not null references app.participant_consents(id) on delete restrict,
  linked_at      timestamptz not null default now(),
  primary key (post_id, participant_id)
);
create index post_participants_consent on app.post_participants (consent_id);

alter table app.participants enable row level security;
alter table app.participant_consents enable row level security;
alter table app.post_participants enable row level security;

create function app.add_participant(p_label text, p_identity_enc text) returns uuid
language plpgsql security definer set search_path = app, pg_temp as $$
declare v uuid;
begin
  if app.viewer_role() is distinct from 'creator' then raise exception 'not allowed' using errcode = '42501'; end if;
  insert into app.participants (creator_id, label, identity_enc, adult_attested)
  values (app.uid(), trim(p_label), p_identity_enc, true) returning id into v;
  insert into app.audit_log (actor_id, action, target_type, target_id) values (app.uid(), 'participant.create', 'participant', v);
  return v;
end $$;

create function app.my_participants()
returns table (id uuid, label text, status text, review_note text, created_at timestamptz, reviewed_at timestamptz,
               active_consents int, withdrawn_consents int, posts int)
language sql stable security definer set search_path = app, pg_temp as $$
  select p.id, p.label, p.status, p.review_note, p.created_at, p.reviewed_at,
         (select count(*)::int from app.participant_consents c where c.participant_id = p.id and c.withdrawn_at is null),
         (select count(*)::int from app.participant_consents c where c.participant_id = p.id and c.withdrawn_at is not null),
         (select count(*)::int from app.post_participants pp where pp.participant_id = p.id)
    from app.participants p
   where p.creator_id = app.uid() and app.viewer_role() = 'creator'
   order by p.created_at desc
$$;

create function app.my_consents(p_participant uuid)
returns table (id uuid, scope text, signed_on date, created_at timestamptz, withdrawn_at timestamptz, withdrawal_reason text)
language sql stable security definer set search_path = app, pg_temp as $$
  select c.id, c.scope, c.signed_on, c.created_at, c.withdrawn_at, c.withdrawal_reason
    from app.participant_consents c join app.participants p on p.id = c.participant_id
   where p.id = p_participant and p.creator_id = app.uid() and app.viewer_role() = 'creator'
   order by c.created_at desc
$$;

create function app.add_consent(p_participant uuid, p_scope text, p_signed_on date, p_signature_enc text) returns uuid
language plpgsql security definer set search_path = app, pg_temp as $$
declare v uuid;
begin
  if not exists (select 1 from app.participants where id = p_participant and creator_id = app.uid()
                   and status in ('pending', 'verified') and app.viewer_role() = 'creator') then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if p_signed_on > current_date then raise exception 'consent date is in the future' using errcode = '22023'; end if;
  insert into app.participant_consents (participant_id, scope, signed_on, signature_enc, recorded_by)
  values (p_participant, trim(p_scope), p_signed_on, p_signature_enc, app.uid()) returning id into v;
  insert into app.audit_log (actor_id, action, target_type, target_id, metadata)
  values (app.uid(), 'consent.record', 'participant', p_participant, jsonb_build_object('consent', v));
  return v;
end $$;

-- Withdrawal (by the creator, or by the owner from a notice) hides every post
-- that relied on that consent, immediately. Nothing is deleted.
create function app.withdraw_consent(p_consent uuid, p_reason text) returns int
language plpgsql security definer set search_path = app, pg_temp as $$
declare n int;
begin
  if not exists (
    select 1 from app.participant_consents c join app.participants p on p.id = c.participant_id
     where c.id = p_consent and c.withdrawn_at is null
       and (app.is_owner() or (p.creator_id = app.uid() and app.viewer_role() = 'creator'))
  ) then raise exception 'not found' using errcode = 'P0002'; end if;
  update app.participant_consents set withdrawn_at = now(), withdrawn_by = app.uid(), withdrawal_reason = nullif(trim(p_reason), '')
   where id = p_consent;
  with h as (
    update app.posts set hidden_at = coalesce(hidden_at, now()), hidden_reason = 'Consent withdrawn'
     where id in (select post_id from app.post_participants where consent_id = p_consent) returning id
  ) select count(*) into n from h;
  insert into app.audit_log (actor_id, action, target_type, target_id, metadata)
  values (app.uid(), 'consent.withdraw', 'consent', p_consent, jsonb_build_object('posts_hidden', n));
  return n;
end $$;

-- Link the people who appear in a post. Every participant must be verified
-- and have an active consent; linking sends the post to review.
create function app.set_post_participants(p_post uuid, p_participants uuid[], p_consents uuid[]) returns void
language plpgsql security definer set search_path = app, pg_temp as $$
declare i int;
begin
  if not app.owns_post(p_post) then raise exception 'not found' using errcode = 'P0002'; end if;
  if coalesce(array_length(p_participants, 1), 0) <> coalesce(array_length(p_consents, 1), 0) then
    raise exception 'each participant needs a consent' using errcode = '22023';
  end if;
  for i in 1 .. coalesce(array_length(p_participants, 1), 0) loop
    if not exists (
      select 1 from app.participants p join app.participant_consents c on c.participant_id = p.id
       where p.id = p_participants[i] and c.id = p_consents[i] and p.creator_id = app.uid()
         and p.status = 'verified' and c.withdrawn_at is null
    ) then raise exception 'participant not verified or consent not active' using errcode = '22023'; end if;
  end loop;
  delete from app.post_participants where post_id = p_post;
  insert into app.post_participants (post_id, participant_id, consent_id)
  select p_post, u.p, u.c from unnest(p_participants, p_consents) as u(p, c);
  if coalesce(array_length(p_participants, 1), 0) > 0 then
    update app.posts set review_state = 'pending',
           review_reasons = (select array_agg(distinct r) from unnest(review_reasons || array['participants']) r),
           reviewed_by = null, reviewed_at = null
     where id = p_post;
  end if;
  insert into app.audit_log (actor_id, action, target_type, target_id, metadata)
  values (app.uid(), 'post.participants', 'post', p_post, jsonb_build_object('count', coalesce(array_length(p_participants, 1), 0)));
end $$;

-- A post hidden because consent was withdrawn (or a verification revoked)
-- can't be un-hidden by anyone while that is still the case.
create function app.post_participants_valid(p_post uuid) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select not exists (
    select 1 from app.post_participants pp
      join app.participant_consents c on c.id = pp.consent_id
      join app.participants p on p.id = pp.participant_id
     where pp.post_id = p_post and (c.withdrawn_at is not null or p.status <> 'verified'))
$$;
revoke all on function app.post_participants_valid(uuid) from public;
grant execute on function app.post_participants_valid(uuid) to mk_app;

create function app.posts_consent_guard() returns trigger language plpgsql set search_path = app, pg_temp as $$
begin
  if old.hidden_at is not null and new.hidden_at is null and not app.post_participants_valid(new.id) then
    raise exception 'participant consent or verification is no longer valid' using errcode = '42501', hint = 'consent_invalid';
  end if;
  return new;
end $$;
create trigger posts_consent_guard before update of hidden_at on app.posts for each row execute function app.posts_consent_guard();

create function app.post_participant_list(p_post uuid) returns table (participant_id uuid, label text, consent_id uuid, consent_active boolean)
language sql stable security definer set search_path = app, pg_temp as $$
  select pp.participant_id, p.label, pp.consent_id, c.withdrawn_at is null
    from app.post_participants pp join app.participants p on p.id = pp.participant_id
    join app.participant_consents c on c.id = pp.consent_id
   where pp.post_id = p_post and (app.owns_post(p_post) or app.is_owner())
$$;

-- Owner: verification queue, decision, and audited access to encrypted identity.
create function app.participant_queue()
returns table (id uuid, creator_id uuid, creator_name text, label text, status text, created_at timestamptz, consents int, posts int)
language sql stable security definer set search_path = app, pg_temp as $$
  select p.id, p.creator_id, c.display_name, p.label, p.status, p.created_at,
         (select count(*)::int from app.participant_consents x where x.participant_id = p.id and x.withdrawn_at is null),
         (select count(*)::int from app.post_participants pp where pp.participant_id = p.id)
    from app.participants p join app.creators c on c.user_id = p.creator_id
   where app.is_owner()
   order by (p.status = 'pending') desc, p.created_at
   limit 200
$$;

create function app.participant_identity(p_id uuid, p_purpose text) returns text
language plpgsql security definer set search_path = app, pg_temp as $$
declare v text;
begin
  if not app.is_owner() then raise exception 'not allowed' using errcode = '42501'; end if;
  if coalesce(char_length(trim(p_purpose)), 0) < 10 then raise exception 'state why you need this' using errcode = '22023'; end if;
  select identity_enc into v from app.participants where id = p_id;
  if v is null then raise exception 'not found' using errcode = 'P0002'; end if;
  -- Recorded before anything is returned.
  insert into app.audit_log (actor_id, action, target_type, target_id, metadata)
  values (app.uid(), 'participant.identity_view', 'participant', p_id, jsonb_build_object('purpose', left(trim(p_purpose), 200)));
  return v;
end $$;

create function app.review_participant(p_id uuid, p_decision text, p_note text) returns void
language plpgsql security definer set search_path = app, pg_temp as $$
declare n int;
begin
  if not app.is_owner() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_decision not in ('verified', 'rejected', 'revoked') then raise exception 'bad decision' using errcode = '22023'; end if;
  if p_decision <> 'verified' and coalesce(char_length(trim(p_note)), 0) < 5 then
    raise exception 'add a note' using errcode = '22023';
  end if;
  update app.participants set status = p_decision, review_note = nullif(trim(p_note), ''), reviewed_by = app.uid(), reviewed_at = now()
   where id = p_id and (p_decision <> 'revoked' or status = 'verified') and (p_decision = 'revoked' or status = 'pending');
  get diagnostics n = row_count;
  if n = 0 then raise exception 'not found' using errcode = 'P0002'; end if;
  -- Revoking verification hides every post that names this participant.
  if p_decision = 'revoked' then
    update app.posts set hidden_at = coalesce(hidden_at, now()), hidden_reason = 'Participant verification revoked'
     where id in (select post_id from app.post_participants where participant_id = p_id);
  end if;
  insert into app.audit_log (actor_id, action, target_type, target_id, metadata)
  values (app.uid(), 'participant.' || p_decision, 'participant', p_id, '{}'::jsonb);
end $$;

revoke all on function app.add_participant(text, text), app.my_participants(), app.my_consents(uuid),
  app.add_consent(uuid, text, date, text), app.withdraw_consent(uuid, text), app.set_post_participants(uuid, uuid[], uuid[]),
  app.post_participant_list(uuid), app.participant_queue(), app.participant_identity(uuid, text),
  app.review_participant(uuid, text, text) from public;
grant execute on function app.add_participant(text, text), app.my_participants(), app.my_consents(uuid),
  app.add_consent(uuid, text, date, text), app.withdraw_consent(uuid, text), app.set_post_participants(uuid, uuid[], uuid[]),
  app.post_participant_list(uuid), app.participant_queue(), app.participant_identity(uuid, text),
  app.review_participant(uuid, text, text) to mk_app;

-- ---------------------------------------------------------------------
-- 1. Takedown notices from anyone (no account needed). Written only by the
-- server (system role) after validation and rate limiting.
-- ---------------------------------------------------------------------
create table app.takedown_notices (
  id                uuid primary key default gen_random_uuid(),
  reference         text not null unique check (reference ~ '^TD-[A-Z2-7]{10}$'),
  category          text not null check (category in ('ncii', 'csam', 'consent_withdrawn', 'impersonation', 'other_illegal')),
  requester_role    text not null check (requester_role in ('depicted_person', 'authorized_representative', 'other')),
  -- AES-256-GCM: requester name, email and electronic signature.
  contact_enc       text not null check (char_length(contact_enc) <= 4000),
  -- Keyed hash of the normalised email, for deduplication and rate limiting only.
  contact_hash      text not null check (contact_hash ~ '^[0-9a-f]{64}$'),
  location          text not null check (char_length(location) between 3 and 1000),
  target_key        text check (char_length(target_key) <= 200),
  target_post_id    uuid references app.posts(id) on delete set null,
  target_creator_id uuid references app.users(id) on delete set null,
  description       text check (char_length(description) <= 2000),
  good_faith        boolean not null check (good_faith),
  status            text not null default 'received'
                    check (status in ('received', 'in_review', 'removed', 'rejected', 'escalated')),
  duplicate_of      uuid references app.takedown_notices(id),
  received_at       timestamptz not null default now(),
  due_at            timestamptz not null,
  decided_at        timestamptz,
  decided_by        uuid references app.users(id),
  decision_note     text check (char_length(decision_note) <= 1000),
  copies_removed    int not null default 0 check (copies_removed >= 0),
  check (due_at <= received_at + interval '48 hours')
);
create index takedown_queue on app.takedown_notices (due_at) where status in ('received', 'in_review');
create index takedown_target on app.takedown_notices (target_key) where target_key is not null;
create index takedown_contact on app.takedown_notices (contact_hash, received_at desc);
alter table app.takedown_notices enable row level security;

-- ---------------------------------------------------------------------
-- 4. Safeguarding: trained staff, cases, events and legal holds
-- ---------------------------------------------------------------------
create table app.safeguarding_staff (
  user_id      uuid primary key references app.users(id) on delete restrict,
  trained_on   date not null,
  training     text not null check (char_length(training) between 3 and 200),
  attested_at  timestamptz not null default now(),
  revoked_at   timestamptz
);
alter table app.safeguarding_staff enable row level security;

create function app.is_safeguarding_staff() returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select app.is_owner() and exists (select 1 from app.safeguarding_staff s where s.user_id = app.uid() and s.revoked_at is null)
$$;
revoke all on function app.is_safeguarding_staff() from public;
grant execute on function app.is_safeguarding_staff() to mk_app;

create table app.safeguarding_cases (
  id               uuid primary key default gen_random_uuid(),
  reference        text not null unique check (reference ~ '^SG-[A-Z2-7]{10}$'),
  source_type      text not null check (source_type in ('report', 'takedown', 'scan', 'manual')),
  source_id        uuid,
  subject_post_id  uuid references app.posts(id) on delete restrict,
  subject_user_id  uuid references app.users(id) on delete restrict,
  summary          text not null check (char_length(summary) between 3 and 1000),
  status           text not null default 'open'
                   check (status in ('open', 'assessing', 'report_required', 'reported', 'no_report_required', 'closed')),
  decision_reason  text check (char_length(decision_reason) <= 2000),
  decided_by       uuid references app.users(id),
  decided_at       timestamptz,
  external_ref     text check (char_length(external_ref) <= 120),
  reported_at      timestamptz,
  reported_by      uuid references app.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (status <> 'reported' or (external_ref is not null and reported_at is not null)),
  check (status <> 'no_report_required' or char_length(decision_reason) >= 40)
);
create unique index safeguarding_one_per_source on app.safeguarding_cases (source_type, source_id) where source_id is not null;
create index safeguarding_open on app.safeguarding_cases (created_at) where status not in ('reported', 'no_report_required', 'closed');
alter table app.safeguarding_cases enable row level security;

create table app.safeguarding_events (
  id         bigserial primary key,
  case_id    uuid not null references app.safeguarding_cases(id) on delete restrict,
  actor_id   uuid references app.users(id),
  kind       text not null check (char_length(kind) <= 60),
  note       text check (char_length(note) <= 2000),
  created_at timestamptz not null default now()
);
create index safeguarding_events_case on app.safeguarding_events (case_id, id);
alter table app.safeguarding_events enable row level security;

create table app.legal_holds (
  id              uuid primary key default gen_random_uuid(),
  case_id         uuid references app.safeguarding_cases(id) on delete restrict,
  takedown_id     uuid references app.takedown_notices(id) on delete restrict,
  object_type     text not null check (object_type in ('post', 'user', 'message', 'media_upload')),
  object_id       uuid not null,
  -- What existed when the hold was placed: metadata, text and media references/fingerprints.
  snapshot        jsonb not null,
  placed_at       timestamptz not null default now(),
  preserve_until  timestamptz not null,
  released_at     timestamptz,
  released_by     uuid references app.users(id),
  release_reason  text check (char_length(release_reason) <= 1000),
  check (case_id is not null or takedown_id is not null),
  check (released_at is null or released_at >= preserve_until)
);
create unique index legal_holds_one_active on app.legal_holds (case_id, object_type, object_id) where released_at is null;
create index legal_holds_object on app.legal_holds (object_type, object_id) where released_at is null;
alter table app.legal_holds enable row level security;

-- Evidence stays put: the event log and holds are append-only (holds may only be released).
create function app.safeguarding_events_guard() returns trigger language plpgsql set search_path = app, pg_temp as $$
begin
  raise exception 'safeguarding events are append-only' using errcode = '42501';
end $$;
create trigger safeguarding_events_guard before update or delete on app.safeguarding_events
  for each row execute function app.safeguarding_events_guard();

create function app.legal_holds_guard() returns trigger language plpgsql set search_path = app, pg_temp as $$
begin
  if tg_op = 'DELETE' then raise exception 'legal holds are never deleted' using errcode = '42501'; end if;
  if (new.case_id, new.takedown_id, new.object_type, new.object_id, new.snapshot, new.placed_at)
     is distinct from (old.case_id, old.takedown_id, old.object_type, old.object_id, old.snapshot, old.placed_at)
     or new.preserve_until < old.preserve_until
     or old.released_at is not null then
    raise exception 'a legal hold can only be extended or released' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger legal_holds_guard before update or delete on app.legal_holds
  for each row execute function app.legal_holds_guard();

create function app.under_hold(p_type text, p_id uuid) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select exists (select 1 from app.legal_holds where object_type = p_type and object_id = p_id and released_at is null)
$$;
revoke all on function app.under_hold(text, uuid) from public;
grant execute on function app.under_hold(text, uuid) to mk_app;

-- Held objects can't be deleted (by anyone, including the server) and held
-- post content can't be rewritten.
create function app.legal_hold_delete_guard() returns trigger language plpgsql set search_path = app, pg_temp as $$
declare t text := tg_argv[0]; k uuid;
begin
  k := case when tg_table_name = 'post_content' then (to_jsonb(old) ->> 'post_id')::uuid else (to_jsonb(old) ->> 'id')::uuid end;
  if app.under_hold(t, k) then
    raise exception 'under legal hold' using errcode = '42501', hint = 'legal_hold';
  end if;
  return old;
end $$;
create trigger posts_legal_hold_guard before delete on app.posts for each row execute function app.legal_hold_delete_guard('post');
create trigger post_content_legal_hold_guard before delete on app.post_content for each row execute function app.legal_hold_delete_guard('post');
create trigger users_legal_hold_guard before delete on app.users for each row execute function app.legal_hold_delete_guard('user');
create trigger messages_legal_hold_guard before delete on app.messages for each row execute function app.legal_hold_delete_guard('message');
create trigger media_uploads_legal_hold_guard before delete on app.media_uploads for each row execute function app.legal_hold_delete_guard('media_upload');

create function app.post_content_hold_guard() returns trigger language plpgsql set search_path = app, pg_temp as $$
begin
  if (new.body, new.media) is distinct from (old.body, old.media) and app.under_hold('post', old.post_id) then
    raise exception 'under legal hold' using errcode = '42501', hint = 'legal_hold';
  end if;
  return new;
end $$;
create trigger post_content_hold_guard before update on app.post_content for each row execute function app.post_content_hold_guard();

-- Safeguarding read helpers for trained staff (mk_app has no table grants).
create function app.safeguarding_case_list()
returns table (id uuid, reference text, source_type text, status text, summary text, created_at timestamptz,
               subject_post_id uuid, subject_user_id uuid, holds int, hours_open numeric)
language sql stable security definer set search_path = app, pg_temp as $$
  select c.id, c.reference, c.source_type, c.status, c.summary, c.created_at, c.subject_post_id, c.subject_user_id,
         (select count(*)::int from app.legal_holds h where h.case_id = c.id and h.released_at is null),
         round(extract(epoch from now() - c.created_at)::numeric / 3600, 1)
    from app.safeguarding_cases c
   where app.is_safeguarding_staff()
   order by (c.status in ('reported', 'no_report_required', 'closed')), c.created_at
   limit 200
$$;

-- Count only: visible to the owner even before training is attested, so an
-- urgent case is never invisible.
create function app.safeguarding_open_count() returns int
language sql stable security definer set search_path = app, pg_temp as $$
  select case when app.is_owner() then
    (select count(*)::int from app.safeguarding_cases where status not in ('reported', 'no_report_required', 'closed'))
  else 0 end
$$;

create function app.attest_safeguarding_training(p_trained_on date, p_training text) returns void
language plpgsql security definer set search_path = app, pg_temp as $$
begin
  if not app.is_owner() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_trained_on > current_date or p_trained_on < current_date - 3 * 365 then
    raise exception 'training date must be within the last three years' using errcode = '22023';
  end if;
  insert into app.safeguarding_staff (user_id, trained_on, training) values (app.uid(), p_trained_on, trim(p_training))
  on conflict (user_id) do update set trained_on = excluded.trained_on, training = excluded.training, attested_at = now(), revoked_at = null;
  insert into app.audit_log (actor_id, action, target_type, target_id, metadata)
  values (app.uid(), 'safeguarding.training_attested', 'user', app.uid(), jsonb_build_object('trained_on', p_trained_on));
end $$;

revoke all on function app.safeguarding_case_list(), app.safeguarding_open_count(), app.attest_safeguarding_training(date, text) from public;
grant execute on function app.safeguarding_case_list(), app.safeguarding_open_count(), app.attest_safeguarding_training(date, text) to mk_app;

-- ---------------------------------------------------------------------
-- Viewer grants (two layers: the app checks the permission, RLS checks again)
-- ---------------------------------------------------------------------
-- Takedown notices: the owner (AAL2) reads and decides. Inserts come only from the server.
grant select, update (status, decided_at, decided_by, decision_note, copies_removed) on app.takedown_notices to mk_app;
create policy takedown_owner_select on app.takedown_notices for select to mk_app using (app.is_owner());
create policy takedown_owner_update on app.takedown_notices for update to mk_app using (app.is_owner()) with check (app.is_owner());

grant select, insert on app.blocked_media_hashes to mk_app;
create policy blocked_hashes_owner_select on app.blocked_media_hashes for select to mk_app using (app.is_owner());
create policy blocked_hashes_owner_insert on app.blocked_media_hashes for insert to mk_app with check (app.is_owner());

-- Safeguarding: only the owner WITH attested training. Ordinary moderation access is not enough.
grant select, insert (id, reference, source_type, source_id, subject_post_id, subject_user_id, summary),
      update (status, decision_reason, decided_by, decided_at, external_ref, reported_at, reported_by, updated_at)
   on app.safeguarding_cases to mk_app;
create policy safeguarding_cases_staff on app.safeguarding_cases for all to mk_app
  using (app.is_safeguarding_staff()) with check (app.is_safeguarding_staff());

grant select, insert (case_id, actor_id, kind, note) on app.safeguarding_events to mk_app;
grant usage on sequence app.safeguarding_events_id_seq to mk_app;
create policy safeguarding_events_select on app.safeguarding_events for select to mk_app using (app.is_safeguarding_staff());
create policy safeguarding_events_insert on app.safeguarding_events for insert to mk_app
  with check (app.is_safeguarding_staff() and actor_id = app.uid());

grant select, insert (case_id, object_type, object_id, snapshot, preserve_until),
      update (released_at, released_by, release_reason, preserve_until) on app.legal_holds to mk_app;
create policy legal_holds_select on app.legal_holds for select to mk_app using (app.is_safeguarding_staff());
create policy legal_holds_insert on app.legal_holds for insert to mk_app
  with check (app.is_safeguarding_staff() and case_id is not null and preserve_until >= now() + interval '365 days');
create policy legal_holds_release on app.legal_holds for update to mk_app
  using (app.is_safeguarding_staff()) with check (app.is_safeguarding_staff());

-- Moderation log: new automatic actions from this phase.
alter table app.moderation_actions drop constraint moderation_actions_action_check;
alter table app.moderation_actions add constraint moderation_actions_action_check check (action in (
  'in_review', 'dismiss', 'hide_post', 'restore_post', 'suspend_user', 'escalate', 'resolve', 'auto_hide_post',
  'takedown_remove', 'takedown_hide'));
