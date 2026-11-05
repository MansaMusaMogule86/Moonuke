import "server-only";

/**
 * Age & identity verification — provider-independent integration surface.
 *
 * NO VENDOR IS SELECTED OR ACTIVE. A vendor may be added only after review
 * of privacy (data residency, retention, sub-processors), regional coverage,
 * the content categories it permits, liveness/document support, and the
 * compliance obligations for the jurisdictions served — see
 * docs/verification-design.md. Until then, verification is a manual owner
 * review recorded in app.creator_verifications (method = 'manual').
 *
 * Data minimisation: we store the vendor's reference and the RESULT
 * (identity/age/consent-records checks), never document images, legal
 * names or dates of birth.
 */
export type VerificationCheck = "identity" | "age" | "consent_records";

export type VerificationResult = {
  vendorRef: string;
  status: "verified" | "rejected" | "needs_more_info";
  checks: Partial<Record<VerificationCheck, boolean>>;
  /** Vendor-supplied reason code; never raw PII. */
  reason?: string;
};

export interface VerificationProvider {
  readonly id: string;
  readonly regions: readonly string[];
  /** Start a hosted verification session for a creator; returns where to send them. */
  startSession(input: { userId: string; returnUrl: string; idempotencyKey: string }): Promise<{ vendorRef: string; redirectUrl: string }>;
  /** Verify the webhook signature and map the payload to a result. Must reject unsigned/forged payloads. */
  parseWebhook(rawBody: string, headers: Headers): Promise<VerificationResult>;
}

const approvedProviders: VerificationProvider[] = [];

export const verificationProvider = (): VerificationProvider | null => approvedProviders[0] ?? null;

/** The three checks the owner must confirm before a creator can be published. */
export const REQUIRED_CHECKS: { key: VerificationCheck; label: string; help: string }[] = [
  { key: "identity", label: "Identity confirmed", help: "The creator is who they say they are." },
  { key: "age", label: "18+ confirmed", help: "Age verified from a reliable source, not only self-attested." },
  { key: "consent_records", label: "Consent & records process in place", help: "Everyone appearing in content is 18+, has consented, and required records are kept." },
];
