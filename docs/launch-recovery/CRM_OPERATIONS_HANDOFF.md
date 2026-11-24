# Implementation Handoff — `crm.divafans.com` Operations CRM

**Prepared:** 2026-11-24  
**Scope Rule:** This is a standalone implementation handoff. **No CRM code has been mixed into `integration/divafans-launch-recovery-20261124`.** Start the CRM on a separate branch (or separate Next.js app / monorepo package) after the recovery branch is merged.

---

## 1. Purpose & Separation Boundary

`crm.divafans.com` is an internal **Operations CRM** for DivaFans operators (Jade, Kael Veyre, and explicitly authorized staff) to manage:
1. Creator recruitment pipeline (white-glove onboarding, creator applications, invite links, verification status, launch checklist).
2. Creator success & retention (activity cadence, tier configuration, referral performance, compliance notices).
3. Support & safety escalations (takedown SLA tracking, message/post report queues, appeal turnaround).
4. Partner / agency / business development contacts (US LLC setup, adult-compatible payment processor underwriting, safety vendors).

### Hard Architectural Boundaries
- **Subdomain & Cookie Isolation:** Host at `crm.divafans.com` with its own `__Host-divafans_crm_session` cookie (never share wildcard `.divafans.io` / `.divafans.com` cookies with the fan/creator app).
- **Authentication & MFA:** Require AAL2 TOTP MFA on every CRM login. Restrict access to verified owner accounts (`OWNER_001` Jade, `OWNER_002` Kael Veyre) and explicitly granted staff roles via RBAC.
- **Database Isolation:** Connect to PostgreSQL using a dedicated least-privilege CRM role (`mk_crm`) with explicit RLS policies and read-only views into core platform tables (`app.creators`, `app.onboarding_cases`, `app.referral_requests`, `app.creator_recruitments`) — **never** grant `mk_crm` write access to financial ledger tables (`app.ledger_entries`, `app.owner_payout_destinations`, `app.payouts`, `app.payments`) or raw MFA/password tables (`app.mfa_factors`, `app.users.password_hash`).
- **Two-Owner Financial Boundary:** CRM must never alter the 50/50 ownership registry (`OWNER_001` / `OWNER_002`), approve distributions, or initiate payouts. Those remain exclusively inside `/owner` with dual-owner MFA step-up.
- **Zero Sensitive PII Exposure:** Never store raw bank credentials, IBANs, or unencrypted legal IDs in CRM notes or custom fields.

---

## 2. Recommended Repository & Branch Strategy

- **Branch name (after recovery PR merges):** `feat/crm-operations-portal` (or a dedicated repository `divafans-crm` sharing only versioned schema contracts).
- **Stack alignment:** Next.js App Router + TypeScript strict + Tailwind CSS (black, gold, and restrained pink luxury operations theme) + PostgreSQL schema `crm` (separate from `app` schema, referencing `app.users(id)` / `app.creators(id)` by immutable UUID only).

---

## 3. Proposed `crm` Schema (Forward Migrations Only)

Create under `supabase/migrations/` (only on the CRM branch):
1. `crm.contacts` — prospective creators, agencies, legal/payment/safety vendors (`id`, `kind`, `display_name`, `handle`, `country`, `stage`, `owner_user_id`, `linked_user_id`, `created_at`, `updated_at`).
2. `crm.deals` / `crm.onboarding_tracks` — pipeline stage (`sourced`, `contacted`, `invited`, `verifying`, `live`, `paused`, `declined`), assigned operator, expected go-live date, linked `app.onboarding_cases(id)`.
3. `crm.activities` — append-only operator call/email/meeting logs, follow-up due dates, and SLA reminders (strictly no passwords, raw tokens, or banking details).
4. `crm.tasks` — assigned operational tasks with priority, due date, and completion audit trail.
5. `crm.audit_log` — append-only audit trail for every CRM view of sensitive creator records and every status change.

---

## 4. Phased Implementation Plan

| Phase | Scope | Acceptance Criteria |
|---|---|---|
| **CRM-1: Auth & Shell** | Subdomain `crm.divafans.com`, AAL2 MFA gate, `mk_crm` DB role + RLS schema lint | Non-owner/non-staff receives 404; MFA enforced in app + DB; zero access to `app.ledger_entries` or `app.mfa_factors` |
| **CRM-2: Creator Pipeline** | Kanban + table view of prospective & onboarding creators linked to `app.onboarding_cases` | Filter by stage, country eligibility (`Europe`, `Morocco`, `GCC`), verification status, and referrer |
| **CRM-3: Tasks & Activities** | Activity timeline, follow-up tasks, SLA badges for 48h takedowns & pending verifications | Full audit trail; redacted structured logs; keyboard & WCAG 2.1 AA axe pass at 390px and 1440px |
| **CRM-4: Vendor & Launch Tracker** | Structured tracker for US LLC (Issue #7), payment processors (Issue #8), and safety vendors (Issue #9) | Document checklist status only; no credentials or live payment keys stored in DB |

---

## 5. Pre-Conditions Before Starting CRM Build

1. Merge `integration/divafans-launch-recovery-20261124` into the default branch.
2. Confirm DNS & Vercel project/subdomain configuration for `crm.divafans.com` (strictly `robots: noindex, nofollow`, IP/access-controlled).
3. Approve the `mk_crm` database role permission matrix before applying `crm` schema migrations.
