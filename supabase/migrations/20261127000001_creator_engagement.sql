-- Phase 6 engagement: likes, comments, tips, vault folders and attachments.
-- Tips are recorded as quoted intents only: payments are inactive, so no money
-- moves and the ledger is untouched until a processor is approved (see policy.ts).
-- Media bytes stay placeholder until storage + scan providers are configured.

-- ---------------------------------------------------------------- likes
create table if not exists app.post_likes (
  post_id    uuid not null references app.posts(id) on delete cascade,
  fan_id     uuid not null references app.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, fan_id)
);
create index if not exists post_likes_post on app.post_likes (post_id, created_at desc);
alter table app.post_likes enable row level security;

-- ---------------------------------------------------------------- comments
create table if not exists app.post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references app.posts(id) on delete cascade,
  author_id  uuid not null references app.users(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 1000),
  hidden_at  timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post on app.post_comments (post_id, created_at);
alter table app.post_comments enable row level security;

-- ---------------------------------------------------------------- tips (quoted only)
create table if not exists app.tips (
  id              uuid primary key default gen_random_uuid(),
  creator_id      uuid not null references app.creators(user_id) on delete cascade,
  fan_id          uuid not null references app.users(id) on delete cascade,
  amount_cents    int not null check (amount_cents between 100 and 100000),
  currency        char(3) not null default 'USD',
  target_kind     text not null default 'creator' check (target_kind in ('creator', 'post', 'message')),
  target_id       uuid,
  status          text not null default 'quoted' check (status in ('quoted', 'succeeded', 'refunded')),
  idempotency_key text not null unique,
  created_at      timestamptz not null default now()
);
create index if not exists tips_creator on app.tips (creator_id, created_at desc);
create index if not exists tips_fan on app.tips (fan_id, created_at desc);
alter table app.tips enable row level security;

-- ---------------------------------------------------------------- vault folders
create table if not exists app.media_folders (
  id         uuid primary key default gen_random_uuid(),
  creator_id uuid not null references app.creators(user_id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 60),
  sort       int not null default 1,
  created_at timestamptz not null default now(),
  unique (creator_id, name)
);
alter table app.media_folders enable row level security;

-- Reusable vault organization: media_uploads may sit in one creator-owned folder.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'app' and table_name = 'media_uploads' and column_name = 'folder_id'
  ) then
    alter table app.media_uploads add column folder_id uuid references app.media_folders(id) on delete set null;
  end if;
end $$;
create index if not exists media_uploads_folder on app.media_uploads (folder_id);

-- ---------------------------------------------------------------- attachments
create table if not exists app.post_attachments (
  post_id    uuid not null references app.posts(id) on delete cascade,
  upload_id  uuid not null references app.media_uploads(id) on delete cascade,
  sort       int not null default 1,
  created_at timestamptz not null default now(),
  primary key (post_id, upload_id)
);
alter table app.post_attachments enable row level security;

create table if not exists app.message_attachments (
  message_id uuid not null references app.messages(id) on delete cascade,
  upload_id  uuid not null references app.media_uploads(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, upload_id)
);
alter table app.message_attachments enable row level security;

-- ---------------------------------------------------------------- RLS helpers
create or replace function app.owns_upload(p_upload uuid) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select exists (
    select 1 from app.media_uploads m
    where m.id = p_upload and m.owner_id = app.uid()
  )
$$;
revoke all on function app.owns_upload(uuid) from public;
grant execute on function app.owns_upload(uuid) to mk_app;

-- ---------------------------------------------------------------- policies
drop policy if exists post_likes_select on app.post_likes;
create policy post_likes_select on app.post_likes for select to mk_app
  using (fan_id = app.uid() or app.is_owner() or exists (
    select 1 from app.posts p where p.id = post_likes.post_id and p.creator_id = app.uid()
  ));
drop policy if exists post_likes_insert on app.post_likes;
create policy post_likes_insert on app.post_likes for insert to mk_app
  with check (fan_id = app.uid() and app.can_view_post(post_id));

drop policy if exists post_likes_delete on app.post_likes;
create policy post_likes_delete on app.post_likes for delete to mk_app
  using (fan_id = app.uid());

drop policy if exists post_comments_select on app.post_comments;
create policy post_comments_select on app.post_comments for select to mk_app
  using (app.can_view_post(post_id) or author_id = app.uid() or app.is_owner());

drop policy if exists post_comments_insert on app.post_comments;
create policy post_comments_insert on app.post_comments for insert to mk_app
  with check (author_id = app.uid() and hidden_at is null and app.can_view_post(post_id));

drop policy if exists post_comments_delete on app.post_comments;
create policy post_comments_delete on app.post_comments for delete to mk_app
  using (author_id = app.uid());

drop policy if exists tips_select on app.tips;
create policy tips_select on app.tips for select to mk_app
  using (fan_id = app.uid() or creator_id = app.uid() or app.is_owner());

drop policy if exists tips_insert on app.tips;
create policy tips_insert on app.tips for insert to mk_app
  with check (fan_id = app.uid() and status = 'quoted');

drop policy if exists tips_update on app.tips;
create policy tips_update on app.tips for update to mk_app
  using (fan_id = app.uid() and idempotency_key is not null)
  with check (fan_id = app.uid());

drop policy if exists media_folders_select on app.media_folders;
create policy media_folders_select on app.media_folders for select to mk_app
  using (creator_id = app.uid() or app.is_owner());

drop policy if exists media_folders_insert on app.media_folders;
create policy media_folders_insert on app.media_folders for insert to mk_app
  with check (creator_id = app.uid() and app.viewer_role() = 'creator');

drop policy if exists media_folders_update on app.media_folders;
create policy media_folders_update on app.media_folders for update to mk_app
  using (creator_id = app.uid()) with check (creator_id = app.uid());

drop policy if exists media_folders_delete on app.media_folders;
create policy media_folders_delete on app.media_folders for delete to mk_app
  using (creator_id = app.uid());

drop policy if exists post_attachments_select on app.post_attachments;
create policy post_attachments_select on app.post_attachments for select to mk_app
  using (app.can_view_post(post_id) or app.owns_upload(upload_id) or app.is_owner());

drop policy if exists post_attachments_insert on app.post_attachments;
create policy post_attachments_insert on app.post_attachments for insert to mk_app
  with check (app.owns_post(post_id) and app.owns_upload(upload_id));

drop policy if exists post_attachments_delete on app.post_attachments;
create policy post_attachments_delete on app.post_attachments for delete to mk_app
  using (app.owns_post(post_id));

drop policy if exists message_attachments_select on app.message_attachments;
create policy message_attachments_select on app.message_attachments for select to mk_app
  using (app.is_owner() or app.owns_upload(upload_id) or exists (
    select 1 from app.messages m join app.conversations c on c.id = m.conversation_id
    where m.id = message_id and (c.fan_id = app.uid() or c.creator_id = app.uid())
  ));

drop policy if exists message_attachments_insert on app.message_attachments;
create policy message_attachments_insert on app.message_attachments for insert to mk_app
  with check (app.owns_upload(upload_id) and exists (
    select 1 from app.messages m where m.id = message_id and m.sender_id = app.uid()
  ));

drop policy if exists message_attachments_delete on app.message_attachments;
create policy message_attachments_delete on app.message_attachments for delete to mk_app
  using (exists (select 1 from app.messages m where m.id = message_id and m.sender_id = app.uid()));

-- ---------------------------------------------------------------- grants (no truncate/references/trigger)
grant select on app.post_likes to mk_app;
grant insert, delete on app.post_likes to mk_app;
grant select on app.post_comments to mk_app;
grant insert, delete on app.post_comments to mk_app;
grant select on app.tips to mk_app;
grant insert, update on app.tips to mk_app;
grant select, insert, update, delete on app.media_folders to mk_app;
grant select on app.post_attachments to mk_app;
grant insert, delete on app.post_attachments to mk_app;
grant select on app.message_attachments to mk_app;
grant insert, delete on app.message_attachments to mk_app;
grant update (folder_id) on app.media_uploads to mk_app;
drop policy if exists media_uploads_folder_update on app.media_uploads;
create policy media_uploads_folder_update on app.media_uploads for update to mk_app
  using (owner_id = app.uid())
  with check (owner_id = app.uid() and (folder_id is null or exists (
    select 1 from app.media_folders f where f.id = folder_id and f.creator_id = app.uid()
  )));
