# Next phase: Phase 4 (white-glove creator onboarding), remaining work

**Scope given by the owner:** white-glove creator onboarding, social profile connections, profile imports, AI-assisted setup and creator approval workflows. Keep every integration configurable; buy nothing.

## Already built (don't rebuild)
Details are in `docs/phase-4-architecture.md`.

| Area | Status |
|---|---|
| White-glove cases (single-use, email-locked, 14-day invite), concierge notes, welcome call | Done |
| Pipeline board with derived stages: Invited, To approve, Preparing profile, Verification, Ready to verify, Live | Done |
| House-prepared profile proposals; only the creator accepts or declines; field-by-field diff | Done |
| Social connections: proof code in bio, owner verification, opt-in display, link domain pinning | Done |
| AI-assisted profile copy: `template` (default), `anthropic` (opt-in), safety filter, consent, metering | Done |
| Approval workflow: account approval, then verification checklist, then publish | Done (Phases 2–3) |

## Remaining requirements

### 1. Profile imports — scope UNKNOWN; confirm before building
Confirmed so far: "profile imports" are in scope. Everything else is unspecified.

Questions to resolve:
- **Platforms:** which ones?
- **Fields:** display name, bio, avatar, links? Imported images would need storage, and storage doesn't exist yet.
- **Method:**
  - (a) the creator pastes text, or uploads a platform data export;
  - (b) official OAuth APIs, which require developer app registration and review on each platform;
  - (c) **not** scraping, which is ruled out by platform terms and reliability.
- **Consent:** imported data must flow through a `profile_proposals` entry (source `"import"`), so the creator approves it like any other draft.

A safe default to propose: a manual or export-based import that fills a proposal. This needs no paid services and no platform approvals.

### 2. AI-assisted setup: follow-ups
- A live test of the Anthropic adapter needs approval plus an API key, because it costs money. Until then it stays `template`.
- **UNKNOWN:** should the assistant also draft tier names, perks or prices? Prices must stay server-validated.

### 3. Onboarding polish (optional; confirm)
- Email the creator when the house sends a proposal. Not built yet; uses the existing outbox.
- Reminders for stalled stages. **UNKNOWN** whether wanted.

## Acceptance rules for any new work
- Every new table has RLS. Owner-only data goes through a narrow `SECURITY DEFINER` view for creators.
- House or AI content reaches a profile **only** after the creator accepts it.
- No new external network calls by default; anything external is opt-in by env and documented in `.env.example`.
- Add server tests (app-layer **and** direct-RLS denial) and browser checks with axe at 1440 and 390 px. Register new suites in `scripts/verify.mjs`.
- `pnpm verify` must pass before pushing. Report it as a local run.

## After Phase 4 (order UNKNOWN; ask the owner)
Remaining from the original brief:
- Fan app: vault, messaging, notifications, purchase history, subscription management.
- Creator studio: posts, media, scheduling, tiers, Blasts, segmentation, analytics, earnings.
- Supabase Auth migration (`docs/supabase-auth-migration.md`).
- Payments, crypto and ledger (not activated).
- Release hardening.
