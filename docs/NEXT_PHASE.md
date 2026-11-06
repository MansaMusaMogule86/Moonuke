# Next phase

> **2026-11-06:** safety and compliance (roadmap items 1–4) is built and verified locally: `docs/phase-8-safety-compliance.md`. The owner needs to confirm or change the proposed defaults SC1–SC11; remaining legal, provider and launch dependencies are in `docs/DECISION_REGISTER.md` §7.
>
> **2026-11-05:** the full decision register, compatibility matrix, cost assessment, legal blockers, roadmap and readiness checklist are in `docs/DECISION_REGISTER.md`. Proposed business defaults there are **for evaluation only** and not approved.

**Latest work: Phase 8, zero-cost production readiness.** See `docs/PHASE_8_REPORT.md` and `docs/phase-8-infrastructure.md`. Payments, uploads and Supabase Auth are **built but disabled**: server-enforced flags, refused in production. Phases 1–7 are complete.

## What's left, and why it isn't built
Everything that needs no decision is built. **Each remaining item needs the owner's approval, money, or a legal or business answer:**

| Item | Blocked by |
|---|---|
| Attachments and real post uploads | The pipeline is built and disabled (Phase 8). It needs approval of an object-storage provider **and** CSAM/NCII hash-matching (paid services), then an adapter for each |
| Payments: checkout, tips, paid messages, paid Blasts, payouts, crypto | The engine, ledger and webhook contract are built and disabled (Phase 8). It needs a compliant approved provider (A10); fee, payout minimum and hold, currencies (#6); refund entitlement policy; P1–P3, T1–T4 |
| Earnings dashboard | Payments |
| Supabase Auth switch | The provider seam and regression tests are built (Phase 8). It needs the §10 answers, a Supabase project, and approval (A3) |
| ID and age verification vendor | Vendor selection (A7) |
| Real email delivery | SMTP provider and sending domain (open question #7) |
| Production deployment | Approval and a hosting target (A10, open question #9) |
| Editorial photography | Visual direction approval (A13) |
| Takedown statements of reasons and creator appeals; requester acknowledgements | Counsel (EU DSA Art. 17 and 20) and the SC9 decision |
| Participant ID-document verification; private evidence storage | KYC vendor (P-3) and storage (P-5) approvals |
| NCMEC submission | Manual only by design. Needs ESP registration and a counsel-verified procedure |
| A separate moderator role | Capabilities are designed (`src/server/auth/staff.ts`, inactive). It needs the owner's decision (A1) |
| Retention and deletion periods, data export | Legal (open question #5) |
| Re-enabling CI | The workflow is updated to run `pnpm verify` and stays disabled. It needs approval (A11) and an Actions-enabled account |
| Visual identity change | Owner decision: the Phase 8 brief conflicts with the approved black-and-gold identity (see DECISIONS) |

All built defaults were **confirmed by the owner on 2026-11-05** (`docs/DECISIONS.md`).

## Phase 6: follow-ups (confirm before building)
- **Notification preferences** (per-creator mute, email digests). **UNKNOWN** whether wanted. Email would use the existing outbox.
- **Tips and gifting.** Blocked by payments.
- Defaults F1–F5: confirmed.

## Phase 5: remaining slices (confirm before building)
- **Analytics, beyond 5c.** **UNKNOWN:** should post views or engagement be recorded? That is new data collection and needs a privacy decision. Should top fans (identities) be shown to creators?
- **5d Blasts, fan messaging, segmentation, top fans.** These need the messaging system above.
- **5e Earnings, payouts, transactions.** Blocked by payments being inactive and fees, payout schedule and currencies being UNKNOWN. An empty, clearly labelled earnings view is possible.
- **Media uploads.** Blocked: they need approval for object storage plus CSAM/NCII hash-matching.
- **Exclusive drops.** **UNKNOWN** what they mean.
- Defaults P1–P3 and T1–T4: confirmed.

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
