# Next phase

Phase 4 (white-glove creator onboarding) is **built**, including profile imports. Details are in `docs/phase-4-architecture.md`.

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

## After Phase 4 (order UNKNOWN; ask the owner)
Remaining from the original brief:
- Fan app: vault, messaging, notifications, purchase history, subscription management.
- Creator studio: posts, media, scheduling, tiers, Blasts, segmentation, analytics, earnings.
- Supabase Auth migration (`docs/supabase-auth-migration.md`).
- Payments, crypto and ledger (not activated).
- Release hardening.
