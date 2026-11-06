import "server-only";
import { hkdfSync } from "node:crypto";
import { appSecret, env, isProd } from "@/server/env";
import { signHmac, verifyHmac } from "@/server/payments/webhook";

// =====================================================================
// Age-assurance provider seam. A real vendor (P-2) is added as another
// adapter only after the owner approves it. Providers return an OUTCOME:
// never a date of birth, a document or an image.
// =====================================================================

export type AgeResult = { checkId: string; providerRef: string; result: "passed" | "failed"; method: string; assurance: "high" | "standard" };

export type AgeProvider = {
  id: string;
  /** Where to send the user to start a check. */
  start(checkId: string): { path: string };
  /** Verify a signed result (raw body + signature header). Null if invalid. */
  verify(rawBody: string, signature: string | null): AgeResult | null;
};

const mockSecret = () => Buffer.from(hkdfSync("sha256", appSecret(), Buffer.alloc(0), "age-mock-v1", 32)).toString("hex");

/** Test-only provider. Refuses to exist in production. */
export function mockAgeProvider(): AgeProvider {
  if (isProd()) throw new Error("The mock age provider is for tests only.");
  return {
    id: "mock",
    start: (checkId) => ({ path: `/verify-age/mock?check=${encodeURIComponent(checkId)}` }),
    verify(rawBody, signature) {
      if (!verifyHmac(mockSecret(), rawBody, signature)) return null;
      try {
        const r = JSON.parse(rawBody) as AgeResult;
        if (typeof r.checkId !== "string" || typeof r.providerRef !== "string" || !["passed", "failed"].includes(r.result)) return null;
        if (!["high", "standard"].includes(r.assurance) || typeof r.method !== "string") return null;
        return r;
      } catch {
        return null;
      }
    },
  };
}

/** Sign a mock result (the mock page and tests). */
export function signMockResult(r: AgeResult, t = Math.floor(Date.now() / 1000)): { body: string; signature: string } {
  if (isProd()) throw new Error("The mock age provider is for tests only.");
  const body = JSON.stringify(r);
  return { body, signature: signHmac(mockSecret(), body, t) };
}

/** The configured provider, or null. */
export function ageProvider(): AgeProvider | null {
  return env().AGE_PROVIDER === "mock" ? mockAgeProvider() : null;
}
