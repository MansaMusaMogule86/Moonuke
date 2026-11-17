-- Notifications expansion: new kinds, idempotent delivery, richer preferences.
-- Financial notifications never carry amounts: they link to ledger-backed pages.
-- Push remains blocked (no provider); in-app + email only.

alter table app.notifications drop constraint if exists notifications_kind_check;
alter table app.notifications add constraint notifications_kind_check check (kind in (
  'post.published', 'proposal.received', 'message.received', 'blast.received', 'system',
  'tip.received', 'subscription.started', 'subscription.renewed',
  'payment.succeeded', 'payment.refunded',
  'referral.commission', 'payout.available', 'payout.requested', 'payout.paid', 'payout.failed',
  'content.published', 'blast.sent', 'security.alert'
));

alter table app.notifications add column if not exists idempotency_key text;
create unique index if not exists notifications_dedupe
  on app.notifications (user_id, kind, idempotency_key)
  where idempotency_key is not null;

-- Preferences: keep the original three columns; add the rest with safe defaults.
alter table app.user_preferences add column if not exists notify_tips boolean not null default true;
alter table app.user_preferences add column if not exists notify_subscriptions boolean not null default true;
alter table app.user_preferences add column if not exists notify_referrals boolean not null default true;
alter table app.user_preferences add column if not exists notify_payouts boolean not null default true;
alter table app.user_preferences add column if not exists notify_security boolean not null default true;
alter table app.user_preferences add column if not exists email_digest text not null default 'off'
  check (email_digest in ('off', 'daily', 'weekly'));
alter table app.user_preferences add column if not exists timezone text not null default 'UTC'
  check (char_length(timezone) between 1 and 60);

grant select, insert, update (notify_new_posts, notify_messages, notify_billing, notify_tips,
  notify_subscriptions, notify_referrals, notify_payouts, notify_security,
  email_digest, timezone, updated_at)
  on table app.user_preferences to mk_app;
