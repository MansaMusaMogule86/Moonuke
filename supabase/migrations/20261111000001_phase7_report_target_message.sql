-- Phase 7: messages can be reported. Separate file: a new enum value can't be
-- used in the same transaction that adds it.
alter type app.report_target add value if not exists 'message';
