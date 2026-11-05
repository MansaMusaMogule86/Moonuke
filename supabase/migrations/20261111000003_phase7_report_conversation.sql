-- Phase 7a: the house needs the conversation id of a reported message to
-- request exceptional access (it can't read messages under RLS).
create function app.report_conversation(p_report uuid) returns uuid
language sql stable security definer set search_path = app, pg_temp as $$
  select m.conversation_id from app.reports r join app.messages m on m.id = r.target_id
   where r.id = p_report and r.target_type = 'message' and app.is_owner()
$$;
revoke all on function app.report_conversation(uuid) from public;
grant execute on function app.report_conversation(uuid) to mk_app;
