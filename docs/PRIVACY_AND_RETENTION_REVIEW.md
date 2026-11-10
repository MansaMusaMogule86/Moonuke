# Security monitoring: privacy and retention review

**Not legal advice.** This is an engineering proposal for qualified counsel to review. Nothing here is published, and retention is switched off until it's approved.

## What is processed, and why

| Purpose | Data | Proposed lawful basis (to confirm) | Notes |
|---|---|---|---|
| Account security and fraud prevention (sign-in, MFA, blocked accounts) | Account id; keyed IP hash; IP network prefix; approximate country and region from the hosting network; browser, OS and device family; session reference; time | Legitimate interests (GDPR art. 6(1)(f)); UAE PDPL equivalent; necessary for the security of processing (GDPR art. 32) | No raw IP, raw user agent, GPS, phone or device identifiers. No cross-site identifiers |
| Detecting attacks on accounts that may not exist | Keyed hash of the submitted email | Legitimate interests | The address itself is never stored |
| Admission workflow oversight (registrations, creator applications) | Account id, role, invitation row id, application id | Contract / legitimate interests | The accounts themselves are governed by the existing account records |
| Administrative accountability | Audit entries for console views, searches and changes | Legitimate interests / legal obligation | Uses the existing audit log |

Security logging is separate from product analytics. **No optional analytics, tracking scripts, fingerprinting or third-party processors were added.** If analytics are wanted later, they need their own consent review.

**Jurisdictions to confirm with counsel:** UAE (PDPL, and DIFC/ADGM if relevant), EU/UK GDPR for EU/UK users, US state laws, and any country-specific rules flagged in `docs/DECISION_REGISTER.md`. The geolocation comes from the hosting provider (Vercel or Cloudflare). They are existing processors, but the data-processing agreements and international transfer basis should be confirmed.

## Proposed retention (engineering defaults, not legal requirements)

| Data | Proposed period | Implemented as |
|---|---|---|
| Successful sign-in events | 30 days | `routine_retention_days = 30` |
| Registration and creator-application telemetry | 30 days (the accounts are not touched) | routine class |
| Failed authentication telemetry | 30 days | routine class |
| Security incidents (alerts, and events an alert points to) | 90 days; longer under a legal hold | `incident_retention_days = 90`; events held by an unresolved alert are never deleted |
| Daily aggregates | 12 months | Digests are emails, and no aggregate table is kept yet. **Open:** should digest emails count as the 12-month aggregate? |
| Notification delivery logs | 30 days | security emails in `app.email_outbox` |

`pnpm security:run` applies retention only when `retention_enabled = true`, which is **false** by default and can't be changed from the console. Until it's approved, the job reports what it would delete. To approve, apply a migration that sets the agreed periods and turns retention on, and record the decision in `docs/DECISIONS.md`.

**Account deletion and legal holds (open).** On account deletion, `actor_user_id` becomes null (`on delete set null`), which leaves pseudonymous security records that expire under the policy above. A legal hold needs a mechanism to suspend deletion, for example marking events `incident` and resolving nothing. Counsel should confirm whether that's acceptable.

## Draft privacy-notice text (for review; not published)

> **Security monitoring.** To protect accounts, we record sign-ins, failed sign-in attempts, two-step verification attempts, new registrations and creator applications. For each, we keep the time, a coded (hashed) form of your IP address together with its network range, an approximate country and region provided by our hosting network, and your browser, operating system and device type. We don't keep your full IP address, precise location, device identifiers or anything you typed into a password field. We use this information only to detect and investigate suspicious activity, such as repeated failed sign-ins or sign-ins from a new kind of device, and to alert our team. Only the platform owner can view it, after signing in with two-step verification, and each view is logged. We keep routine records for [30] days and records linked to a security incident for [90] days, or longer where the law requires. Our hosting provider ([Vercel]) supplies network location data and processes requests on our behalf, which may involve transfers outside your country under [safeguards]. You can ask about, or object to, this processing by contacting [contact route to be decided].

The bracketed items need decisions: the periods, the processors, the transfer safeguards, and a support contact route (no support email has been chosen yet).
