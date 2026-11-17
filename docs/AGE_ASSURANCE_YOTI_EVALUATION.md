# Age assurance — Yoti candidate evaluation (no vendor wired)

Status: provider seam only. `src/server/compliance/ageProvider.ts` is mock-only
in production builds; `/verify-age` is gated by `age_assurance` (default off);
jurisdiction rules live in `access.ts` + migration phase 10; tests in
`age-geo.test.ts`. No approved vendor is wired. No worldwide or legal-approval
claims are made.

## Candidate: Yoti facial age estimation

- What it is: a facial age-estimation product (selfie/video), distinct from
  ID document verification and from creator payout KYC.
- Why considered: privacy-preserving (no DOB/document retention by design),
  liveness support, and configurable thresholds with uncertain-outcome handling.
- Not selected or integrated. A decision needs counsel plus a written vendor
  review (data processing, retention, biometric rules per jurisdiction).

## Required controls before any rollout

- Liveness: require anti-spoof liveness on every check; reject still images.
- Thresholds: set an 18+ decision threshold with a safety buffer (e.g. treat
  estimated-under-25 as uncertain); never use the raw estimate as proof.
- Uncertain handling: route low-confidence results to an approved fallback
  (ID check or denial), rate-limit retries, and log only the outcome.
- Alternatives: always offer a non-biometric route (approved ID vendor or
  manual review) where the law requires choice or accommodation.
- Never accepted: checkbox self-declaration, or a completed payment, as age
  verification.
- Data minimization: store only the outcome (`age_checks`: pass/fail, method,
  timestamps, provider ref). Never store DOB, documents, or biometrics.
- Separation: fan age assurance is separate from creator payout KYC, which may
  require provider-requested documents. Do not mix the two stores.

## Blockers

- L-1 (served/blocked jurisdictions), L-2 (vendor + method), and P-2 (age
  vendor) in `docs/DECISION_REGISTER.md` remain open and blocking.
