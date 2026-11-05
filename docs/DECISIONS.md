# Decisions

**Approved** means the owner stated it in writing. **Default** means it was built as the default and **still needs confirmation**. Detailed rationale is in the phase docs.

## Approved by the owner

| # | Decision | Source |
|---|---|---|
| A1 | Invitation-only, no unrestricted registration; a single owner controls access; owner approval is required after invitation | Phase 2 brief |
| A2 | Referral requests allowed; only the owner issues or approves invitations | Phase 2 brief |
| A3 | Supabase Auth is the **target**. Prepare a migration plan and **don't switch** until it is tested and approved | Phase 3 brief |
| A4 | Transactional email for invitations, recovery, approvals and security notices; manual link delivery stays | Phase 3 brief |
| A5 | Keep the private-profile access model, applied consistently to metadata, feeds, media and search | Phase 3 brief |
| A6 | Discovery behind authenticated, approved membership; the public sees marketing only | Phase 3 brief |
| A7 | Design ID and age verification, but **don't select or activate** a vendor before review | Phase 3 brief |
| A8 | Mandatory owner MFA | Phase 3 brief |
| A9 | "Moonuke" is a working name; keep branding centralised | Phase 3 brief |
| A10 | **No spending:** no GitHub Actions or billing, paid CI, live payments, deployment, paid photography or purchased services without approval | Phase 3 and 4 directives |
| A11 | GitHub-hosted CI paused; run all verification locally | Phase 4 directive |
| A12 | Keep integrations configurable; buy no third-party services | Phase 4 directive |
| A13 | Placeholder portraits until the visual direction is approved | Phase 2 brief |

## Built as defaults (confirm or change)

| # | Default | Where |
|---|---|---|
| D1 | Own email and password sessions until the Supabase switch | ARCHITECTURE |
| D3 | `private` profile means visible to current subscribers, the creator and the owner | phase-2 doc |
| D5 | Fans give an 18+ attestation plus owner review. **Not verified age assurance** | phase-2 doc |
| D6 | Referral requesters see the status only, never the invitation token | phase-2 doc |
| D7 | Invitations issued from referrals are single-use, email-locked and last 7 days | phase-2 doc |
| D8 | The owner is an administrator only, not a creator | phase-2 doc |
| D9 | Rate-limit values as in the code (`src/server/services/rateLimit.ts`) | — |
| S1 | Critical post reports (possible minor, non-consensual, illegal) **hide the post immediately**, pending review | phase-3 doc |
| S2 | Blocks hide both people from each other | phase-3 doc |
| S3 | Nobody can block the owner | phase-3 doc |
| S4 | Reporters see the status only | phase-3 doc |
| M1 | Members may turn MFA on or off; the owner can't turn it off | phase-3 doc |
| M2 | A password change keeps the current session and revokes the others | phase-3 doc |
| V1 | The Phase 2 seeded and curated creators migrated as verified and published | phase-3 doc |
| V2 | The owner checklist is attested after out-of-band checks | phase-3 doc |
| E1 | Approval emails are sent; rejection emails are not | phase-3 doc |
| W1 | White-glove invitations last 14 days and are single-use and email-locked | phase-4 doc |
| W2 | The welcome call and socials are optional steps | phase-4 doc |
| W3 | Social verification is manual (proof code in the bio) | phase-4 doc |
| W4 | The AI provider defaults to `template` (local and free) | phase-4 doc |
| W5 | `AI_MODEL` defaults to `claude-opus-5-5` when Anthropic is enabled | phase-4 doc |
| C1 | `style-src 'unsafe-inline'` is allowed (React and Motion style attributes); scripts are nonce-locked | phase-3 doc |

## Open questions (unresolved — do not assume)
1. **Missing PRD.** The original "MOONUKE PRD" was never supplied. Should it be added to `docs/`?
2. **What's next after Phase 4.** Do we build the fan app (vault, messaging, notifications), the creator studio (posts, media, tiers, Blasts) or payments?
3. **Profile imports.** Which platforms, which fields, and by what method (manual paste, file export, or OAuth after platform app review)? See `docs/NEXT_PHASE.md`.
4. **Supabase Auth.** Can it import scrypt hashes? How should recovery codes work? Is per-session revocation needed? What JWT lifetime is acceptable for suspensions? See `docs/supabase-auth-migration.md` §10.
5. **Legal.** Which jurisdictions are served? Record-keeping standard (for example, 2257-style)? Mandatory-reporting process? Is fan age assurance required? Data retention periods?
6. **Commercial.** Platform fee percentage, payout schedule, supported currencies, payment providers to apply to.
7. **Email.** Which SMTP provider, and the sending domain (SPF, DKIM, DMARC)?
8. **Visual direction.** Approval to commission or generate editorial photography.
9. **Hosting target**, when deployment is approved (Vercel, Cloudflare or another platform), and the matching `TRUSTED_PROXY`.
