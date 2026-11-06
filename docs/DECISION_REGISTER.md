# Decision register and production-readiness assessment

**Date:** 2026-11-05. **Reviewed against:** commit `1656a55` and the 52 defaults confirmed in `docs/DECISIONS.md`, which are unchanged by this document.
**Nature:** a report only. Nothing was deployed, migrated, purchased or enabled.
**Not legal advice.** Each legal item is marked:
- **VERIFIED:** confirmed in a primary or official source found during research.
- **REPORTED:** from secondary sources (law-firm or vendor summaries).
- **UNRESOLVED:** needs counsel or the owner.

The research sources are listed at the end.

> **Update 2026-11-06 (later):** creator statements of reasons and appeals were built (`docs/phase-9-notices-appeals.md`; proposed defaults AP1–AP6).
>
> **Update 2026-11-06:** roadmap items 1–4 were approved and built locally. See §7 and `docs/phase-8-safety-compliance.md`. Only statuses and the checklist were updated; no confirmed decision was rewritten.

---

## 1. Decision register

**Status key:**
- **Confirmed:** in DECISIONS.md.
- **Proposed:** the owner's evaluation values from this request. Not approved.
- **Conflict:** a proposal that would change a confirmed default, which needs explicit approval.
- **Open:** no proposal yet.

### 1a. Business

| # | Question | Proposed default | Status | Notes |
|---|---|---|---|---|
| B-1 | Platform fee | 15% (`feeBps = 1500`) | Proposed | The engine supports it with no code change. It must be set in config before payments can run; there is no default today |
| B-2 | Minimum payout | $50 | Proposed | `payoutEligibility({ minimumCents: 5000 })` |
| B-3 | Payout hold | 14 days, subject to provider rules | Proposed | Not yet modelled. It needs a hold period added to eligibility (a small change). Adult processors commonly impose their own reserves (REPORTED), and those override ours |
| B-4 | Currency | USD at launch | Proposed, and consistent with confirmed P1 | No change needed |
| B-5 | Refunds revoke purchased access "where legally and technically appropriate" | — | **Conflict** with confirmed **PAY2** (a purchase stays after a refund or chargeback) and adjacent to **P2** | Needs an explicit owner override of PAY2. Technically simple: delete the purchase row on `refunded` or `charged_back`. "Legally appropriate" (consumer-law rights to content already delivered) is UNRESOLVED and needs counsel |
| B-6 | Moderator role | Restricted permissions with audit logs | Proposed, and consistent with the design in `src/server/auth/staff.ts` | Needs the owner to decide who moderators are, how they're vetted, and which capabilities each gets. Implementation is about one slice: a `moderator` role, capability checks, RLS helpers and tests |
| B-7 | Branding | Avoid black and gold; keep "Moonuke" as the working name | **Conflict** with the confirmed Phase 1 identity (fixed tokens in `MASTER_PRD.md` §1) | A rebrand needs explicit approval and a new direction. Tokens are centralised (`src/styles/tokens.css`, `src/config/brand.ts`), so it's mechanically contained |
| B-8 | Payout schedule (weekly or monthly), payout methods | — | Open | Constrained by the processor |
| B-9 | Tips, paid messages and paid-Blast pricing ranges | — | Open | Inherit P1 ($1–$1,000) unless the owner decides otherwise |
| B-10 | Exclusive drops, creator referral programme | — | Open | Never defined |
| B-11 | Missing original PRD | — | Open | Open question #1 |

### 1b. Legal and safety (details in §4)

| # | Question | Status |
|---|---|---|
| L-1 | Which jurisdictions will be served, or geo-blocked, at launch? | Open (blocking) |
| L-2 | Fan age assurance: an 18+ attestation is **not** sufficient where §4 laws apply | Open (blocking). Needs a vendor and method |
| L-3 | Creator and participant ID, age and consent records (Mastercard rules; possibly 2257) | **Built (local), 2026-11-06:** encrypted participant records, under-18 refusal, per-post consent, withdrawal. **Still open:** document verification needs a vendor (P-3) or private evidence storage; 2257 applicability (L-9) |
| L-4 | NCII takedown process for **non-members** within 48 hours (TAKE IT DOWN Act) | **Built (local), 2026-11-06:** public form, 48-hour clock, deduplication, identical-copy removal, fingerprint block. **Still open:** counsel to confirm the notice fields and the process meet the Act; a requester acknowledgement channel |
| L-5 | CSAM: reporting to NCMEC and preserving material for 1 year | **Built (local), 2026-11-06:** a separate safeguarding queue, training-gated access, 365-day legal holds that block deletion, manual-only CyberTipline draft. **Still open:** NCMEC ESP registration, a counsel-verified procedure, secure evidence storage for real media |
| L-6 | Pre-publication review of creator content (Mastercard) | **Built (local), 2026-11-06:** review gate enforced in the database. Default `flagged` (posts naming participants); the owner can switch to `all`. **Still open:** whether the processor requires `all`, and whether existing posts must be re-reviewed (SC4) |
| L-7 | Retention periods, deletion and export requests, privacy policy, terms | Open (counsel) |
| L-8 | Business entity, jurisdiction of incorporation, tax (sales tax, VAT on digital services), creator tax forms | Open (counsel and accountant) |
| L-9 | Whether 2257 applies to the platform (primary or secondary producer) | UNRESOLVED (counsel) |

### 1c. Providers

| # | Need | Candidates (unverified fit) | Status |
|---|---|---|---|
| P-1 | Payment processor (adult-approved) | CCBill, Segpay, Verotel, Epoch. **Stripe is excluded**: adult content is on its prohibited list (VERIFIED, Stripe FAQ) | Open. Apply only after L-1, L-3, L-6 |
| P-2 | Fan age assurance | A vendor meeting Ofcom's "highly effective" standard and EU high-certainty expectations | Open |
| P-3 | Creator ID and age verification | KYC vendor, or a processor-provided one | Open |
| P-4 | Pre-publication CSAM hash matching | Microsoft PhotoDNA (application-based), Thorn Safer (paid), Cloudflare CSAM Scanning Tool (see §2: it is reactive and serves cached content) | Open |
| P-5 | Object storage | Cloudflare R2, S3-compatible others | Open. Adult-content acceptability must be confirmed in writing |
| P-6 | Database host | Supabase (Postgres), Neon, or self-managed Postgres | Open. Adult-content acceptability under Supabase's AUP is **unclear** (§2) |
| P-7 | Email (SMTP) | Any SMTP provider that accepts adult-platform transactional mail | Open (open question #7) |
| P-8 | Hosting runtime | Cloudflare Workers through OpenNext, or a Node host | Open (§2) |
| P-9 | Supabase Auth | Only if P-6 = Supabase | Open (A3, §10 questions) |

### 1d. Infrastructure and deployment

| # | Question | Status |
|---|---|---|
| I-1 | Runtime: Workers (OpenNext) or a Node server? | Open. See the §2 recommendation |
| I-2 | Database: Postgres is **required** (D1 is incompatible, see §2) | Recommended: managed Postgres |
| I-3 | Scheduled jobs (`email:drain`, `blasts:run`, `maintenance`) | Needs Cron Triggers or a scheduler |
| I-4 | Real-time messaging (today: 4-second polling) | Optional upgrade: Durable Objects or WebSockets |
| I-5 | `TRUSTED_PROXY` value | Depends on I-1 (`cloudflare` for Workers) |
| I-6 | Re-enabling CI | Open (A11) |
| I-7 | Production deployment | **Not approved** |

---

## 2. Infrastructure compatibility matrix

MOONUKE's security model depends on **PostgreSQL features**:
- row-level security on 44 tables;
- `SET ROLE mk_app` per transaction, with `app.user_id` and `app.aal` settings;
- 47 SECURITY DEFINER functions;
- invoker guard triggers, and a deferred constraint trigger for the ledger;
- `citext`, plpgsql and partial indexes.

| Component | Fit for MOONUKE | Evidence | Verdict |
|---|---|---|---|
| **Cloudflare D1** (SQLite) | No RLS, no roles, no plpgsql, no SECURITY DEFINER, no deferred constraint triggers | SQLite feature set; D1 docs | **Incompatible.** Using it would mean rewriting the whole authorization layer and every security test. **Not recommended.** |
| **Supabase Postgres** | Plain SQL migrations apply as-is; a custom `mk_app` role and `citext` are available in Postgres | Standard Postgres | **Compatible.** A staging dry-run is needed (role creation and pooler `SET ROLE` behaviour) |
| Supabase Free | 500 MB database; **pauses after 7 days idle**; 2 projects | REPORTED (third-party pricing guides, 2026) | Fine for dev and staging only; **not for production** |
| Supabase AUP and adult content | Policy text found doesn't address consensual adult content; an older version barred "obscene" content | Supabase AUP (fragmentary) | **UNRESOLVED.** Get written confirmation from Supabase before choosing it |
| **Supabase Auth** | Migration plan exists; the seam is built | `docs/supabase-auth-migration.md` | Compatible in principle. Scrypt import, MFA and recovery codes are open (§10) |
| **Cloudflare Workers (OpenNext)** | Next.js runs through the OpenNext adapter; `pg` supported via Hyperdrive (minimum `pg` 8.16.3, `nodejs_compat`) | VERIFIED (Cloudflare Hyperdrive docs). OpenNext plus Hyperdrive timeout reports exist (forum) | **Possible, with work.** The repo has `pg` ^8.23.1 ✓ |
| Workers Free limits | 100,000 requests a day; **10 ms CPU** per invocation; 128 MB | VERIFIED (Cloudflare limits page) | **Not viable for production.** Sign-in uses scrypt (N=2¹⁵), which costs far more than 10 ms of CPU, so sign-in would fail. Server rendering also risks the limit. The Workers Paid plan (≈$5/month, REPORTED) is the minimum realistic plan |
| Hyperdrive | Included on Free and Paid | VERIFIED (Hyperdrive pricing page) | ✓ |
| **Durable Objects** | Could replace polling with WebSockets; operations fail once over the free limit | VERIFIED (DO pricing page); free allowance size REPORTED | Optional; not needed for launch |
| **Cloudflare R2** | S3-style private buckets; presigned URLs fit `StorageAdapter`; **no egress fees** | VERIFIED (Workers pricing page). Free allowance of 10 GB and 1M / 10M operations is REPORTED | **Technically compatible.** Adult-content acceptability isn't stated in the terms found: **confirm with Cloudflare** |
| **Cloudflare CSAM Scanning Tool** | Scans **cached** content served through a Cloudflare zone and reports matches to NCMEC. Per its newer blog post, NCMEC credentials are no longer required | Cloudflare blog and INHOPE (REPORTED). Terms say it "does not relieve you of legal requirements, including preservation" (VERIFIED) | **Useful backstop, not sufficient.** It's reactive, after publication; Mastercard expects pre-publication review. Still need a pre-publication `SafetyScanner` (P-4) |
| Node host (any VM or container) | Runs the app unchanged (`pnpm build && pnpm start`) plus cron | Current architecture | **Lowest-risk path**, with no code changes |
| Email from Workers | `nodemailer` SMTP needs raw TCP; Workers sockets exist, but this hasn't been tested with nodemailer | Unverified | Prefer the provider's HTTP API adapter if running on Workers |
| Payment processors | Stripe prohibits adult content (VERIFIED). CCBill, Segpay, Verotel and Epoch serve adult merchants (REPORTED) | §5 | Engine is provider-agnostic ✓ |

**Recommendation:**
- **Database:** managed Postgres, Supabase or another, after written adult-content confirmation from the vendor.
- **Runtime:** a Node runtime (or the Workers Paid plan through OpenNext once a staging spike passes).
- **Storage:** R2 for media, after written confirmation from Cloudflare.
- **Do not use D1.**

---

## 3. Zero-cost feasibility

| Stage | Zero cost? | Limits and risks |
|---|---|---|
| Local development and tests (today) | **Yes.** It's already running that way (`pnpm verify`) | None |
| Shared dev or staging on free tiers | **Partly** | Supabase Free: 500 MB and pauses after 7 days (REPORTED). Workers Free: 10 ms CPU breaks scrypt sign-in (VERIFIED limit). R2 within its free allowance. No real payments, KYC or scanning |
| Production | **No** | Minimum recurring costs (estimates; verify current pricing): Workers Paid ≈ $5/month or a Node host; managed Postgres without pausing (e.g. Supabase Pro ≈ $25/month, REPORTED); a domain. **Per-use costs:** age-assurance and KYC checks, scanning (PhotoDNA may be free on application), email volume, R2 above its free allowance. **Transaction costs:** adult processors take a percentage plus reserves (REPORTED high-risk pricing) |
| Hidden charge risks | — | Durable Objects and D1 fail when over the free limit rather than billing; Workers Paid overages bill; R2 Class A and B operations beyond the allowance bill; Supabase Pro compute add-ons; GitHub Actions minutes on a private repository |

**Conclusion:** zero cost is achievable for development and a limited staging environment. Production is not zero-cost, mainly because of mandatory age assurance and KYC, a non-pausing database, and paid compute.

---

## 4. Legal and safety blockers

An **18+ checkbox is not age verification.** MOONUKE's current fan check (confirmed default D5: an attestation plus owner approval of each account) is **insufficient** wherever the laws below apply. Invitation-only access doesn't remove the obligation.

| Jurisdiction or rule | Requirement | Status | MOONUKE gap |
|---|---|---|---|
| **UK: Online Safety Act** | Services that allow pornography (user-to-user, Part 3) must use **highly effective age assurance**, from 25 July 2025. Self-declaration is not enough. Ofcom is enforcing | **VERIFIED** (Ofcom) | A HEAA vendor, or geo-block the UK |
| **EU: Digital Services Act** | The Commission's guidelines expect high-certainty age verification for porn; preliminary findings against platforms relying on self-declaration (March 2026) | **REPORTED** (secondary, preliminary) | A vendor; DSA transparency, notice-and-action and statement-of-reasons duties also apply (UNRESOLVED scope) |
| **US: state laws** | About 24 states require age verification for adult sites; upheld under intermediate scrutiny (*Free Speech Coalition v. Paxton*, June 2025) | **VERIFIED** (ruling); state count REPORTED | Per-state verification or geo-blocking; needs a current state list from counsel |
| **US: TAKE IT DOWN Act** | NCII removal within **48 hours** of a valid request; a clear public notice of the process; reasonable efforts against duplicates; FTC enforcement since 19 May 2026 | **REPORTED** (law-firm alerts) | **A public takedown form for non-members**, a 48-hour clock, duplicate matching (hashes), a public notice page |
| **US: 18 U.S.C. § 2258A and the REPORT Act** | Report apparent CSAM (and child trafficking or enticement) to the NCMEC CyberTipline; **preserve material for 1 year** | **VERIFIED** (Public Law 118-59) | Wire up CyberTipline reporting, and keep quarantined material and related data for at least 1 year (U2 already keeps it) |
| **US: 18 U.S.C. § 2257** | Age-record duties for producers; how they apply to platforms is contested in court | **UNRESOLVED** | Counsel must decide; creator verification records may need to meet the standard |
| **Card networks (Mastercard, adult content)** | Verified age and ID of **every person depicted** and of uploaders; written consent; **pre-publication review**; complaint and appeal process; removal on request | **REPORTED** (2021 rules via processors and law firms) | Per-post participant records and consent, a pre-publication review queue, a public complaint channel |
| **Australia: eSafety codes** | Age assurance for porn from 9 March 2026 | **REPORTED** | A vendor, or geo-block |
| **Canada: Bill S-209** | Would require age verification for commercial porn sites. **Not law**: passed the Senate in April 2026 | **REPORTED** | Monitor it |
| Privacy (GDPR, UK GDPR, US state laws) | Lawful basis, data-subject rights, retention, international transfers | UNRESOLVED | Privacy policy, records of processing, deletion and export workflow (design only today) |

**Blocking for launch:**
- L-1 jurisdictions;
- L-2 age assurance;
- L-3 consent records;
- L-4 public NCII takedown;
- L-5 NCMEC reporting;
- L-6 pre-publication review;
- terms and privacy policy;
- entity and tax.

---

## 5. Prioritized roadmap

**Engineering that needs no approval** is marked ✱: it's safe and reversible, and nothing is enabled.

> **2026-11-06:** items 1–4 are **built and verified locally** (see §7). Items 5–12 are unchanged.

| Priority | Item | Depends on |
|---|---|---|
| 1 | ✱ **Public NCII and CSAM takedown request form** for non-members: hashed evidence, a 48-hour SLA clock, duplicate hash blocking, a notice page | None (law already in force) |
| 2 | ✱ **Pre-publication review queue:** posts held until a reviewer approves them, behind a flag so current behaviour is preserved until enabled | B-6 for staff; owner approval to switch on |
| 3 | ✱ **Per-post participant and consent records:** co-performer ID and age references and signed releases, stored as references, not documents | P-3 for real verification |
| 4 | ✱ NCMEC reporting workflow (manual export plus a CyberTipline-ready packet); 1-year preservation lock on quarantined material | Owner approval of the process |
| 5 | ✱ Payout hold period in eligibility; refund-revocation option behind a policy flag (off, keeping PAY2) | B-3, B-5 |
| 6 | ✱ Moderator role: capabilities, RLS helpers, audit, tests (inactive until approved) | B-6 |
| 7 | ✱ Age-assurance adapter interface and geo-gating by jurisdiction (mock provider) | L-1, P-2 for real use |
| 8 | ✱ Staging spike: OpenNext and Hyperdrive on a free account, **local only, no deploy** | Owner approval to create accounts |
| 9 | Provider adapters (payments, storage, scanner, age and KYC, email) | P-1 to P-7 approvals |
| 10 | Rebrand (if approved) | B-7 |
| 11 | Supabase Auth trial on staging | P-6 = Supabase, A3 |
| 12 | Production deployment | Everything above, plus written approval |

---

## 6. Production readiness checklist

**Code and security (done; local evidence: `pnpm verify` PASS at `8f6a0d5`, and again for the 2026-11-06 safety work, see §7):**
- [x] RLS on every table; schema lint; RLS regression suite.
- [x] Server-side authorization in two layers; identical 404s for missing and forbidden pages; CSP and headers.
- [x] Owner MFA; sessions; recovery; rate limits; redacted logs; health check.
- [x] Backup and restore drill; maintenance job; dependency audit.
- [x] Payments, uploads and Supabase Auth gated off and refused in production.

**Blocking: legal and safety (§4)** (`[~]` means built locally, but external or legal dependencies remain)
- [ ] Jurisdictions decided; geo-blocking where not compliant.
- [ ] Fan age assurance (a highly-effective or high-certainty method) integrated.
- [~] Creator and co-performer ID, age and consent records. *Records, consent and withdrawal built; document verification (P-3) open.*
- [~] Public NCII takedown with a 48-hour SLA and a notice page. *Built; counsel review and requester acknowledgements open.*
- [~] NCMEC reporting procedure plus 1-year preservation. *Workflow and holds built; ESP registration, a verified procedure and evidence storage open.*
- [~] Pre-publication review (if required by the processor or counsel). *Built; the mode decision (SC4) is open.*
- [~] Statements of reasons to creators for takedown and review decisions, and an appeal route (EU DSA Art. 17 and 20, REPORTED). *Built (Phase 9); counsel review, the transparency database and member appeals open.*
- [ ] Managed encryption key (KMS) for safety records, separate from `APP_SECRET`.
- [ ] Safeguarding training and procedure signed off for every person with access.
- [ ] Terms, privacy policy, creator agreement, complaints and appeals policy.
- [ ] Entity, tax and bookkeeping set up.

**Blocking: providers (§1c):** written confirmation that adult content is permitted from the database, storage and email providers; processor approval; scanning provider; age and KYC vendor.

**Blocking: infrastructure:**
- [ ] Runtime chosen and a staging spike passed.
- [ ] Postgres without pausing.
- [ ] Cron for the 3 jobs.
- [ ] `TRUSTED_PROXY` set.
- [ ] Secrets in the host's manager.
- [ ] Production restore drill.
- [ ] Log drain and uptime monitor.

**Approvals:**
- [ ] Rebrand decision (B-7).
- [ ] Refund-policy override of PAY2 (B-5).
- [ ] Moderator role (B-6).
- [ ] Re-enabling CI (A11).
- [ ] **Written approval to deploy.**

---

## 7. Safety and compliance implementation (2026-11-06)

**Built locally:** roadmap items 1–4. Details are in `docs/phase-8-safety-compliance.md`.
- Migration `20261114000001_phase8_safety_compliance.sql`.
- No deployment, no paid services, no external submissions, no changes to payments or the visual identity.
- The 52 confirmed defaults, including PAY2, are unchanged.

### 7a. Proposed defaults introduced (awaiting owner confirmation)

| # | Proposed default | Why |
|---|---|---|
| SC1 | The 48-hour clock applies to **every** takedown category, not only NCII | Simpler and conservative; the TAKE IT DOWN Act sets it for NCII |
| SC2 | Urgent categories (NCII, CSAM, consent withdrawn) withhold the post **on receipt**; rejecting the notice restores it | Mirrors confirmed S1 ("content first"). The risk is abuse by false notices, mitigated by SC3 and house review |
| SC3 | Takedown rate limits: 5 per hour per network, 5 per day per email; a honeypot field | Abuse prevention without a paid CAPTCHA |
| SC4 | Review mode `flagged` by default (posts naming participants); `all` is owner-switchable; existing posts aren't re-queued when switching | Preserves current behaviour. A processor may require `all` and re-review |
| SC5 | Minimum lengths: rejecting a post 5 characters; rejecting a notice 10; identity purpose 10; hold release 20; "no report required" 40 | Every sensitive decision has a recorded reason |
| SC6 | Preservation is at least 365 days; holds can be extended, never shortened or deleted; release only after the case closes and the period ends | 18 U.S.C. § 2258A(h) (REPORT Act) |
| SC7 | Safeguarding access: the owner at AAL2 with a self-attested training record (within 3 years) | "Trained, authorised personnel." The standard and evidence of training are UNRESOLVED |
| SC8 | Only `underage_concern` member reports open a safeguarding case automatically; `non_consensual` and `illegal_content` stay in the ordinary queue (with S1 withholding) | Keeps the urgent queue focused on child safety |
| SC9 | No acknowledgement email to requesters; the reference is shown on screen | Avoids a plaintext copy of the email in the outbox |
| SC10 | Participant and consent records are never deleted (`on delete restrict`) | Record-keeping (Mastercard; possibly 2257) |
| SC11 | No identity documents are stored; identity fields are encrypted with a key derived from `APP_SECRET` | No approved storage or KYC vendor. Production needs a managed key |

### 7b. Remaining legal dependencies (counsel)
- **TAKE IT DOWN Act:** do our notice fields and process satisfy a "valid request"? Covered: signature, identification and location of the content, good-faith statement, contact details. What does "known identical copies" mean beyond exact fingerprints? REPORTED.
- **NCMEC:** registration as an electronic service provider; the 2258A report contents; who may view material, and how; preservation scope and secure storage; what may be disclosed to the account holder.
- **EU DSA:**
  - Art. 16 notice-and-action;
  - Art. 17 statements of reasons to the affected creator (not built);
  - Art. 20 internal complaint handling (not built).
- **UK Online Safety Act:** illegal-content duties and record-keeping for takedown decisions.
- **Data protection:** lawful basis and a DPIA for identity, consent and requester data; retention periods for notices, participant records, cases and holds after release (the retention open question).
- **2257:** whether the platform is a secondary producer, and what record format and custodian are required (L-9).
- **Card-network rules:** whether `flagged` review is enough, or every item needs review before publication.

### 7c. Provider approvals still needed
- **ID and age verification vendor (P-3):** to verify participant documents instead of manual attestation.
- **Private evidence storage (P-5):** with adult content allowed in writing, for consent documents and preserved media.
- **Hash-matching scanner (P-4):** pre-publication CSAM and NCII matching. Today only exact fingerprints from our own decisions are blocked.
- **KMS or secret manager:** for the safety encryption key.
- **SMTP (P-7):** for requester acknowledgements, if SC9 is reversed.

### 7d. Remaining launch blockers for this area
- Counsel sign-off on 7b.
- NCMEC registration.
- Training records for every person with access.
- ~~Statements of reasons and appeals for creators~~: built in Phase 9. Counsel review and the EU transparency database (Art. 24(5)) remain.
- A requester follow-up channel.
- Participant document verification.
- Private evidence storage.
- Managed key.
- The moderator role (B-6), if anyone other than the owner will review.
- Everything in §6 outside this area: age assurance, jurisdictions, providers, deployment approval.

---

## Sources (research, 2026-11-05)

**Cloudflare**
- Workers limits: https://developers.cloudflare.com/workers/platform/limits
- Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- D1 FAQ: https://3b21a3e4.previews.developers.cloudflare.com/d1/reference/faq/index.md
- Durable Objects pricing: https://developers.cloudflare.com/durable-objects/platform/pricing
- Hyperdrive pricing: https://developers.cloudflare.com/hyperdrive/platform/pricing/index.md
- Hyperdrive and node-postgres: https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/node-postgres
- Hyperdrive changelog: https://developers.cloudflare.com/hyperdrive/platform/changelog/
- R2 pricing: https://developers.cloudflare.com/r2/pricing/index.md
- CSAM scanning: https://developers.cloudflare.com/cache/reference/csam-scanning/
- CSAM tool update: https://blog.cloudflare.com/a-simpler-path-to-a-safer-internet-an-update-to-our-csam-scanning-tool/
- INHOPE on the tool: https://inhope.org/EN/articles/cloudflare-simplifying-the-fight-against-csam
- Service terms (application services): https://www.cloudflare.com/service-specific-terms-application-services
- Service terms (developer platform): https://www.cloudflare.com/service-specific-terms-developer-platform/
- OpenNext and Hyperdrive forum thread: https://www.answeroverflow.com/c/595317990191398933/1150557986239021106

**Supabase**
- AUP: https://supabase.com/docs/company/aup
- Free-tier limits (third-party): https://automationatlas.io/answers/supabase-free-tier-limits-2026/
- Pricing (third-party): https://makerkit.dev/blog/saas/supabase-pricing

**Payments**
- Stripe prohibited businesses: https://support.stripe.com/questions/prohibited-and-restricted-businesses-list-faqs
- Mastercard on adult content: https://www.mastercard.com/global/en/news-and-trends/perspectives/2021/protecting-our-network-protecting-you-preventing-illegal-adult-content-on-our-network.html
- Mastercard rules (law firm): https://adultbizlaw.com/2021/04/27/mastercards-new-rules-the-details-for-paysite-and-platform-owners-operators/
- Mastercard rules (CCBill): https://ccbill.com/blog/new-mastercard-rules
- Adult payment processing overview: https://thefinrate.com/adult-payment-processing-explained-best-payment-gateways-banking-challenges-and-compliance-requirements/

**UK**
- Ofcom age checks: https://ofcom.org.uk/online-safety/protecting-children/age-checks-to-protect-children-online
- Ofcom letter to Part 3 services: https://www.ofcom.org.uk/online-safety/protecting-children/letter-to-part-3-services-that-allow-pornography-outlining-heaa-requirements
- Ofcom enforcement programme: https://ofcom.org.uk/online-safety/protecting-children/enforcement-programme-to-protect-children-from-encountering-pornographic-content-through-the-use-of-age-assurance

**EU**
- Commission approach: https://www.scl.org/european-commission-sets-out-approach-for-age-verification/
- DSA charges: https://www.pymnts.com/cpi-posts/eu-charges-major-adult-platforms-over-child-safety-failures-under-digital-services-act/
- Minors guidelines: https://digitalpolicyalert.org/event/31906-european-commission-adopted-guidelines-to-enforce-protection-of-minors-online-under-digital-services-act-including-age-verification-requirements

**US**
- *Paxton* (Bloomberg Law): https://news.bloomberglaw.com/litigation/porn-site-age-verification-law-upheld-by-us-supreme-court
- *Paxton* (FIRE): https://www.thefire.org/supreme-court/free-speech-coalition-v-paxton
- TAKE IT DOWN Act (Wiley): https://www.wiley.law/alert-May-19-Deadline-for-TAKE-IT-DOWN-Act-Compliance-Is-Your-Company-Prepared
- TAKE IT DOWN Act (Reed Smith): https://www.reedsmith.com/our-insights/blogs/viewpoints/102ms5e/covered-platforms-are-you-ready-to-take-it-down/
- TAKE IT DOWN Act enforcement: https://www.grcreport.com/post/ftc-begins-enforcing-take-it-down-act-as-platforms-face-48-hour-removal-mandate
- REPORT Act (Public Law 118-59): https://www.govinfo.gov/content/pkg/PLAW-118publ59/html/PLAW-118publ59.htm
- REPORT Act summary: https://wsgr.com/en/insights/new-minor-safety-obligations-for-online-services-report-act-expands-child-sexual-exploitation-reporting-requirements.html
- § 2257 overview: https://en.wikipedia.org/wiki/Child_Protection_and_Obscenity_Enforcement_Act
- § 2257 reporting requirements: https://ilt.eff.org/2257_Reporting_Requirements.html

**Australia and Canada**
- eSafety FAQ: https://esafety.gov.au/industry/codes/faq-access-to-online-porn-and-other-adult-content
- Phase 2 codes: https://www.bakermckenzie.com/en/insight/publications/alerts/2025/09/australia-phase-2-online-safety-codes-registered-by-esafety-commissioner
- Bill S-209 debate: https://www.biometricupdate.com/202510/canadas-age-assurance-debate-heats-up-around-bill-s-209
- Bill S-209 status: https://myparliament.ca/bills/10238
