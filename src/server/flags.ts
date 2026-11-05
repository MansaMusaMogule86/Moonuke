import "server-only";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";

/**
 * Server-enforced feature flags. Every entry point of a gated feature calls
 * `requireFeature()`; hiding a button is never the control. Defaults are OFF,
 * and production refuses to boot with them ON until a provider is approved
 * (see productionProblems in env.ts).
 */
export type Feature = "payments" | "uploads";

export function featureEnabled(f: Feature): boolean {
  const e = env();
  if (f === "payments") return e.FEATURE_PAYMENTS === "on";
  return e.FEATURE_UPLOADS === "on" && e.STORAGE_PROVIDER !== "none" && e.SCAN_PROVIDER !== "none";
}

export function requireFeature(f: Feature): void {
  if (!featureEnabled(f)) {
    throw new AppError("forbidden", f === "payments" ? "Payments aren't active yet." : "Uploads aren't available yet.");
  }
}
