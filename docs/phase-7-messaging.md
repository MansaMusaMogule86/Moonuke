# Phase 7: messaging and Blasts

The owner's brief asks for a creator-controlled messaging system:
- **Direct messages:** members ↔ creators, plus paid requests from non-members.
- **Rich media:** photos, videos, GIFs and voice notes; paid and PPV messages; tips.
- **Blasts:** broadcasts with segments, scheduling, templates and analytics.
- **Layered moderation:** report, block, mute, restrict, risk scoring, minimal-access review, appeals and audited exceptional access.

The brief also says: **prioritise secure, functional free messaging; keep paid features disabled until a compliant payment provider is integrated; never expose locked media.**

## Slices

| Slice | Scope | Status |
|---|---|---|
| **7a** | Free text messaging, permissions, creator settings, mute, restrict, block, report, risk rules, rate limits, house review, exceptional access, notifications, near-real-time updates | **Done** |
| 7b | Blasts: segments (all members, VIP, followers, expired, new, custom lists), templates, scheduling, background queue with batching, retries and idempotency, delivery and read counts, opt-outs | Planned next (no blocker) |
| 7c | Appeals for messaging restrictions and moderation decisions; moderation history per account | Planned (no blocker) |
| 7d | Attachments: photos, videos, GIFs, voice notes, upload progress, previews, private storage, signed downloads | **Blocked:** needs approval for object storage **and** CSAM/NCII hash-matching (see `CURRENT_STATUS`) |
| 7e | Paid messages, PPV media in messages, tips, paid message requests, paid Blasts | **Blocked:** payments inactive; P1/T2 pricing questions are open |
| 7f | Real-time transport (websockets or SSE) | Optional; 7a polls every 4 seconds while the thread is visible |

## 7a: what's built

### Who can message whom
This is decided in the database by `app.can_send_in()`.

| Sender | Allowed when |
|---|---|
| Fan | Has a **current membership** with the creator, the creator allows members to message (`members_can_message`, default on), the creator hasn't restricted this fan, and the creator's profile is visible to them |
| Creator | Their profile is published and the fan is in their **audience** (a current or past member, or a follower). A creator can **open** a new conversation only with current members (`app.open_conversation`) |
| Anyone | Both accounts are active; neither has blocked the other; the sender has no active messaging pause |
| Owner | Never a participant. Can't read conversations under RLS |

Paid message requests from non-members are stored as a creator setting, but they **can't be switched on**: a database CHECK enforces this until payments exist, and the UI shows the toggle disabled with the reason.

### Content
- **Text:** 1–2,000 characters, emoji allowed. Control and bidi characters are stripped.
- **No links, email addresses, phone numbers, handles for other apps, or off-platform payment requests.** The app refuses them with an explanation. A database CHECK on `messages.body` refuses URLs and emails even if the app is bypassed.
- **Paid messages:** the `price_cents` column exists for the future and is forced to `NULL` by a CHECK.
- **Not end-to-end encrypted.** Messages are stored on the server and are readable only through participant RLS, reported-message context, or audited exceptional access. The UI says so.

### Spam and abuse protection
- **Rule-based risk scoring** in `src/server/messaging/risk.ts`. The weights are in one config object. It is explainable and not a machine-learning classifier.

  | Result | Triggered by |
  |---|---|
  | **Reject** | Minors or non-consent; contact details; links; off-platform apps and payments |
  | **Hold for house review** | Threats; scams; the same text sent to several conversations within 10 minutes |
  | Adds points | Shouting; repeated characters; an account under 24 hours old |

- A held message is visible to its sender as "being checked" and invisible to the recipient until the house releases it.
- **Rate limits:** 40 messages per 10 minutes per sender; 15 per minute per conversation.
- **Duplicates:** an identical message to the same conversation within 60 seconds is refused. Every send carries a client idempotency key (unique per sender), so retries never duplicate.
- **Automatic pause:** 5 refused messages in an hour pause the account's messaging for 1 hour. The pause is recorded and shown to the house, which can lift it.

### Per-conversation controls
- **Mute** (either side) stops notifications for that conversation.
- **Restrict** (creator only) stops that fan from sending, without a full block.
- **Block** reuses the existing system and stops both sides.

### Moderation (privacy-first)
- **Reporting:** a recipient can report any message they can see. A report goes into the existing moderation queue as "Private message from …" without its text.
- **Critical reports** (minors, non-consent, illegal) withhold the message at once, mirroring S1 for posts.
- **Reported-message review:** `app.reported_message_context()` returns the reported message plus at most two earlier messages and one later message from the same conversation within 24 hours. Every call is written to the append-only audit log. The house can remove, withhold or restore the message, and pause the sender.
- **Held queue:** `/admin/messaging` lists messages held by the rules, with rule names and score. Viewing it is audited. Release and remove are both audited.
- **Exceptional access** to a whole conversation:
  - Owner only, at AAL2.
  - Requires a written justification of at least 40 characters, stored permanently in the audit log **before** any content is returned (`app.exceptional_conversation_access`).
  - Reached only from a report.
- **Manual pauses:** the house can pause an account's messaging for 1 hour up to 90 days, with a reason the user sees. Pauses can be lifted.
- **Not built yet (7c):** appeals, mute or restrict for the owner, a moderation history page.

### Notifications
- A new message creates or refreshes one unread `message.received` notification per conversation. It never contains message text; it holds the conversation id and the sender's display name.
- Muted conversations notify nothing. Opening the thread marks its notification read.

### Near-real-time
- `GET /api/messages/[id]?after=` is participant-only under RLS, `no-store`, and returns 404 for everyone else.
- The open thread polls it every 4 seconds while the tab is visible. No websockets yet (7f).

### Routes

| Route | Who |
|---|---|
| `/messages`, `/messages/[id]` | Members and creators |
| `/messages/new` | Creators: start with a current member |
| `/studio/messaging` | Creators: messaging settings |
| `/admin/messaging`, `/admin/messaging/report/[id]` | Owner: held queue, pauses, reported-message review, exceptional access |

### Migrations
- `20261111000001_phase7_report_target_message.sql`: adds `message` to the report targets.
- `20261111000002_phase7_messaging.sql`: tables, helpers, policies and triggers.
- `20261111000003_phase7_report_conversation.sql`: the owner-only lookup of a report's conversation.

The tables are `messaging_settings`, `conversations`, `messages` and `messaging_restrictions`. Every write goes through SECURITY DEFINER functions that pin `search_path` and aren't executable by PUBLIC; `mk_app` has no direct insert or update on conversations or messages. The schema lint covers all of it.

### Tests
- **Server:** `tests/server/messaging.test.ts`, 14 tests. They cover:
  - Risk rules.
  - Who can open and send, and every denial path.
  - Mute and restrict.
  - Spam protection: links, duplicates, idempotency, the automatic pause and lifting it.
  - Held messages and the database backstop.
  - RLS: no direct writes; others, other creators and the owner see nothing; no paid messages.
  - Reported-message context and its audit; critical auto-withhold.
  - Exceptional access: justification, AAL2, audit-first, immutable log.
  - Manual pauses.
- **Browser:** `scripts/e2e-phase7.mjs`, 33 checks. These include near-real-time delivery, refusal with the draft kept, access denial (non-member, other creator, signed out), report → house review → removal, the exceptional-access guard, restrict, creator tools, and axe at 1440 and 390 px.

## Defaults (please confirm)

| # | Default |
|---|---|
| M1 | Fans need a current membership to send. Creators can open with current members and message their audience (current or past members and followers) |
| M2 | Members can message by default (`members_can_message` on) |
| M3 | Risk thresholds: reject at 100 points, hold at 60. Rate limits: 40 per 10 minutes and 15 per minute per conversation. Automatic pause: 5 refusals in an hour pause messaging for 1 hour |
| M4 | Reported-message context is 2 before and 1 after, within 24 hours |
| M5 | Exceptional access needs a justification of at least 40 characters. Owner only (there is no separate moderator role yet) |
| M6 | Messages are kept indefinitely until legal retention is decided |

## Open questions (do not assume)
- A separate **moderator role** (non-owner staff)? The brief says "authorized moderators"; today only the owner exists (A1).
- **Storage provider** for attachments, and the **CSAM/NCII hash-matching** service. Both cost money and need approval.
- **Payments:** prices and fees for paid messages, PPV in messages and tips (P1, T2).
- **Retention** of messages and of held or removed messages (legal question #5).
