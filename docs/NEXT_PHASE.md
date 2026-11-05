# Next phase

**Current phase: 7, messaging** (owner brief A19). Slice **7a** is built: free text DMs, permissions, risk rules, moderation and notifications. See `docs/phase-7-messaging.md`. Before that: Phase 6 (fan app), release hardening and Phase 5 (creator studio).

## Phase 7: next slices
- **7b Blasts (next, no blocker).**
  - Segments: all members, VIP, followers, expired members, new members, custom lists.
  - Templates, scheduling, and a background queue with batching, retries and idempotency.
  - Delivery and read counts, and opt-outs.
  - Each recipient gets an individual conversation message; no recipient sees the others.
- **7c Appeals and moderation history (no blocker).**
- **7d Attachments:** blocked until object storage and CSAM/NCII hash-matching are approved.
- **7e Paid messages, PPV in messages, tips, paid requests and paid Blasts:** blocked by payments.
- **Defaults to confirm:** M1–M6 in `docs/DECISIONS.md`. Open question: a separate moderator role?

## Phase 6: follow-ups (confirm before building)
- **Notification preferences** (per-creator mute, email digests). **UNKNOWN** whether wanted. Email would use the existing outbox.
- **Tips and gifting.** Blocked by payments.
- **Defaults to confirm:** F1–F5 in `docs/DECISIONS.md`.

## Phase 5: remaining slices (confirm before building)
- **Analytics, beyond 5c.** **UNKNOWN:** should post views or engagement be recorded? That is new data collection and needs a privacy decision. Should top fans (identities) be shown to creators?
- **5d Blasts, fan messaging, segmentation, top fans.** These need the messaging system above.
- **5e Earnings, payouts, transactions.** Blocked by payments being inactive and fees, payout schedule and currencies being UNKNOWN. An empty, clearly labelled earnings view is possible.
- **Media uploads.** Blocked: they need approval for object storage plus CSAM/NCII hash-matching.
- **Exclusive drops.** **UNKNOWN** what they mean.
- **Defaults to confirm:** P1–P3 and T1–T4. The questions are listed in `docs/DECISIONS.md` → "Still unconfirmed".

## Phase 4: done (don't rebuild)

| Area | Status |
|---|---|
| White-glove cases (single-use, email-locked, 14-day invite), concierge notes, welcome call | Done |
| Pipeline board with derived stages | Done |
| House-prepared profile proposals; only the creator accepts or declines; field-by-field diff | Done |
| Social connections: proof code in bio, owner verification, opt-in display, link domain pinning | Done |
| AI-assisted profile copy: `template` (default), `anthropic` (opt-in), safety filter, consent, metering | Done |
| **Profile imports:** paste or export file, platform-agnostic; name, tagline, bio, links; always a proposal; duplicate-proof; raw text never stored | Done |
| Approval workflow: account approval, then verification checklist, then publish | Done (Phases 2–3) |

## Phase 4: deferred by the owner (don't build without asking)
- Email the creator when the house sends a proposal. This would use the existing outbox.
- Reminders for stalled stages.
- The AI assistant drafting tier names or perks. If this is ever built, prices stay creator-entered and server-validated.
- **Import follow-ups, still UNKNOWN:**
  - Avatar or image import. This needs object storage plus CSAM/NCII hash-matching first.
  - Per-platform export adapters, for example the Instagram or X archive ZIP.
  - Official OAuth imports, which need developer app review on each platform.
- A live test of the Anthropic adapter. It needs approval and an API key, because it costs money.

## Acceptance rules for any new work
- Every new table has RLS. Owner-only data goes through a narrow `SECURITY DEFINER` view for creators.
- House, AI or imported content reaches a profile **only** after the creator accepts it.
- No new external network calls by default. Anything external is opt-in by env and documented in `.env.example`.
- Add server tests (app-layer **and** direct-RLS denial) and browser checks with axe at 1440 and 390 px. Register new suites in `scripts/verify.mjs`.
- `pnpm verify` must pass before pushing. Report it as a local run.

## After Phase 5 (order UNKNOWN; ask the owner)
Remaining from the original brief:
- Supabase Auth migration (`docs/supabase-auth-migration.md`).
- Payments, crypto and ledger (not activated).
- Release hardening.
