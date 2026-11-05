-- Phase 4: profile imports (paste text or a small export file).
-- Imports never touch a profile directly: they become a profile_proposals row
-- with source 'import', which only the creator can accept. The raw pasted text
-- is never stored; only the parsed fields plus a content hash (for duplicate
-- prevention) are kept.

alter table app.profile_proposals drop constraint profile_proposals_source_check;
alter table app.profile_proposals add constraint profile_proposals_source_check
  check (source in ('house', 'assistant', 'creator', 'import'));

-- SHA-256 (hex) of the normalised parsed import. Only set for imports.
alter table app.profile_proposals add column import_hash text
  check (import_hash is null or import_hash ~ '^[0-9a-f]{64}$');
alter table app.profile_proposals add constraint profile_proposals_import_hash_source
  check (import_hash is null or source = 'import');
alter table app.profile_proposals add constraint profile_proposals_import_has_hash
  check (source <> 'import' or import_hash is not null);

-- The same import can't be filed twice for a creator unless the earlier one
-- was withdrawn (superseded).
create unique index profile_proposals_import_once on app.profile_proposals (user_id, import_hash)
  where import_hash is not null and status <> 'superseded';

-- Re-create the insert policy to allow source 'import' for the owner (for any
-- creator) and for a creator (for themselves only).
drop policy proposals_insert on app.profile_proposals;
create policy proposals_insert on app.profile_proposals for insert to mk_app with check (
  author_id = app.uid() and status = 'proposed' and (
    (app.is_owner() and source in ('house', 'assistant', 'import'))
    or (user_id = app.uid() and app.viewer_role() = 'creator' and source in ('assistant', 'creator', 'import'))
  )
);
