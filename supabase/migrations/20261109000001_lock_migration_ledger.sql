-- Supabase exposes schema `public` to the Data API and grants its API roles
-- access to new tables there. The migration ledger must not be readable or
-- writable through the API (deleting rows would make migrations re-run).
-- No-op on plain Postgres, where the API roles don't exist.
alter table public.mk_schema_migrations enable row level security;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.mk_schema_migrations from %I', r);
    end if;
  end loop;
end $$;
