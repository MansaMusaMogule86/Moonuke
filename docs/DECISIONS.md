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
| A14 | Profile imports: paste or export file, platform-agnostic; display name, tagline, bio and links; avatars later (needs storage) | Phase 4 session answers |
| A16 | Next phase after Phase 4: the creator studio | Phase 5 session answer |
| A17 | After Phase 5c: release hardening | Hardening session answer |
| A19 | Phase 7 messaging: hybrid creator-controlled DMs, rich media, paid features, Blasts and layered moderation. Paid features stay disabled until a compliant provider is integrated; prioritise secure free messaging | Phase 7 brief |
| A18 | Phase 6, the fan app: dashboard, vault, purchases, memberships with cancellation, notification centre ready for Messaging and Blasts. No payments, no new tracking, no fake transactions | Phase 6 brief |
| A15 | Defer proposal emails, stalled-stage reminders and AI-drafted tiers or perks | Phase 4 session answers |

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
| I1 | Import limits: 20,000 characters, 64 KB file, 8 links, 20 imports per day | phase-4 doc |
| I2 | Imported links become unverified, hidden claims | phase-4 doc |
| I3 | An identical parsed import is refused unless the earlier one was superseded | phase-4 doc |
| P1 | PPV and tier prices $1–$1,000, USD only | phase-5 doc |
| P2 | Bought posts: access and publish time fixed, no delete | phase-5 doc |
| P3 | Scheduling up to 365 days ahead | phase-5 doc |
| T1 | At most 8 tiers and 8 perks; no free tiers | phase-5 doc |
| T2 | Tier price changes affect new quotes only | phase-5 doc |
| T3 | A tier that has had subscribers keeps its kind; it can be switched off but not deleted | phase-5 doc |
| T4 | At least one tier stays active once a creator has tiers | phase-5 doc |
| F1 | Cancelling ends a membership at the close of the current period; no immediate cancel, no refunds | phase-6 doc |
| F2 | The vault excludes free previews and the fan's own posts | phase-6 doc |
| F3 | Purchases show no amount until payments record one | phase-6 doc |
| F4 | Notifications are kept indefinitely until retention is decided | phase-6 doc |
| F5 | Post notifications go to followers and current members; no per-creator mute yet | phase-6 doc |
| R1 | Housekeeping: rate limits 2 days, reset tokens 7 days, ended sessions 30 days | release-hardening doc |
| R2 | No pruning of the audit log, outbox, accounts or content until retention is decided | release-hardening doc |
| M1 | Fans need a current membership to send; creators open with current members and message their audience | phase-7 doc |
| M2 | Members can message by default | phase-7 doc |
| M3 | Risk: reject at 100, hold at 60. Rate limits 40 per 10 minutes and 15 per minute per conversation. 5 refusals in an hour pause messaging for 1 hour | phase-7 doc |
| M4 | Reported-message context: 2 before, 1 after, within 24 hours | phase-7 doc |
| M5 | Exceptional access: owner only, justification of at least 40 characters, audit-first | phase-7 doc |
| M6 | Messages are kept indefinitely until retention is decided | phase-7 doc |
| C1 | `style-src 'unsafe-inline'` is allowed (React and Motion style attributes); scripts are nonce-locked | phase-3 doc |

## Still unconfirmed: pricing and tier defaults (P1–P3, T1–T4)
These were built as defaults in Phase 5 and are **not** approved. The fan app doesn't depend on them: it never sets or shows a price paid. They decide what creators may charge once payments exist.

| # | Question for the owner |
|---|---|
| P1 | What price range and currencies should apply (now $1–$1,000, USD only)? Should there be free tiers or free PPV? |
| P2 | Once bought, should a post's access and publish time be locked and deletion blocked (as now)? What happens to a buyer's access if a creator leaves? |
| P3 | Is a 365-day scheduling horizon right? |
| T1 | Are 8 tiers and 8 perks per tier the right caps? |
| T2 | When a price changes, do existing members keep their price (grandfathering)? There's no billing yet, so this is undecided. |
| T3 | Should a tier with past members stay type-locked and undeletable (as now)? |
| T4 | Must a creator always keep one tier active? |

## Open questions (unresolved — do not assume)
1. **Missing PRD.** The original "MOONUKE PRD" was never supplied. Should it be added to `docs/`?
2. **Creator studio, remaining slices.** Which analytics metrics (5c)? Should Blasts and messaging wait for the fan app? Are exclusive drops wanted? Should media storage be approved (which provider)?
3. **Profile imports, later.** Per-platform export adapters or OAuth (app review on each platform)? Avatar import once storage exists?
4. **Supabase Auth.** Can it import scrypt hashes? How should recovery codes work? Is per-session revocation needed? What JWT lifetime is acceptable for suspensions? See `docs/supabase-auth-migration.md` §10.
5. **Legal.** Which jurisdictions are served? Record-keeping standard (for example, 2257-style)? Mandatory-reporting process? Is fan age assurance required? Data retention periods?
6. **Commercial.** Platform fee percentage, payout schedule, supported currencies, payment providers to apply to.
7. **Email.** Which SMTP provider, and the sending domain (SPF, DKIM, DMARC)?
8. **Visual direction.** Approval to commission or generate editorial photography.
9. **Hosting target**, when deployment is approved (Vercel, Cloudflare or another platform), and the matching `TRUSTED_PROXY`.
