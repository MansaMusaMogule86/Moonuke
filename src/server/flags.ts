import "server-only";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";

/**
 * Server-enforced feature flags. Every entry point of a gated feature calls
 * `requireFeature()`; hiding a button is never the control. Defaults are OFF,
 * and production refuses to boot with them ON until a provider is approved
 * (see productionProblems in env.ts).
 */
export type Feature = "payments" | "uploads" | "age_assurance" | "geo_restrictions" | "moderators";

export function featureEnabled(f: Feature): boolean {
  const e = env();
  if (f === "payments") return e.FEATURE_PAYMENTS === "on";
  if (f === "age_assurance") return e.FEATURE_AGE_ASSURANCE === "on" && e.AGE_PROVIDER !== "none";
  if (f === "geo_restrictions") return e.FEATURE_GEO_RESTRICTIONS === "on";
  if (f === "moderators") return e.FEATURE_MODERATORS === "on";
  return e.FEATURE_UPLOADS === "on" && e.STORAGE_PROVIDER !== "none" && e.SCAN_PROVIDER !== "none";
}

export function requireFeature(f: Feature): void {
  if (!featureEnabled(f)) {
    const msg = { payments: "Payments aren't active yet.", uploads: "Uploads aren't available yet.", age_assurance: "Age checks aren't active yet.", geo_restrictions: "Regional rules aren't active yet.", moderators: "Moderator access isn't approved yet." }[f];
    throw new AppError("forbidden", msg);
  }
}
