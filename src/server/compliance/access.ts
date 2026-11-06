import "server-only";
import { headers } from "next/headers";
import { system } from "@/server/db";
import type { Viewer } from "@/server/auth/permissions";
import { env, isProd } from "@/server/env";
import { featureEnabled } from "@/server/flags";
import type { TrustedProxy } from "@/server/net/ip";

// =====================================================================
// Access gate: regional rules and age assurance (INACTIVE by default).
// With both flags off this returns "allowed" without touching the
// database, so behaviour is exactly as before. Rules and checks are read by
// the server (system role): the gate runs before the viewer reaches content.
// =====================================================================

export type AccessFlags = { geo: boolean; age: boolean };
export type AccessDecision = { allowed: true } | { allowed: false; reason: "region_blocked" | "age_required" };

/** Tests can force flags; ignored in production. */
export function accessFlags(testing?: AccessFlags): AccessFlags {
  if (testing && !isProd()) return testing;
  return { geo: featureEnabled("geo_restrictions"), age: featureEnabled("age_assurance") };
}

/**
 * Country from the header the trusted proxy sets (never from anything the
 * client controls). Returns null when unknown; no GeoIP database is used.
 */
export function countryFrom(h: { get(name: string): string | null }, mode: TrustedProxy): string | null {
  const raw = mode === "cloudflare" ? h.get("cf-ipcountry") : mode === "vercel" ? h.get("x-vercel-ip-country") : null;
  const c = raw?.trim().toUpperCase() ?? "";
  // XX = unknown, T1 = Tor (Cloudflare): both treated as unknown.
  return /^[A-Z]{2}$/.test(c) && c !== "XX" ? c : null;
}

export async function evaluateAccess(viewer: Pick<Viewer, "id" | "role"> | null, country: string | null, opts: { testing?: AccessFlags } = {}): Promise<AccessDecision> {
  const f = accessFlags(opts.testing);
  if (!f.geo && !f.age) return { allowed: true };
  // The house administers the service and is never gated.
  if (viewer?.role === "owner") return { allowed: true };
  const ctx = await system((q) =>
    q.one<{ rule: string | null; scope: string; passed: boolean }>(
      `select (select rule from app.jurisdiction_rules where country = coalesce($1, 'XX')) as rule,
              app.age_assurance_scope() as scope,
              exists (select 1 from app.age_checks where user_id = $2::uuid and status = 'passed' and (expires_at is null or expires_at > now())) as passed`,
      [country, viewer?.id ?? null],
    ),
  );
  if (f.geo && ctx?.rule === "block") return { allowed: false, reason: "region_blocked" };
  const ageNeeded = f.age && (ctx?.scope === "everywhere" || ctx?.rule === "age_assurance");
  if (ageNeeded && !ctx?.passed) return { allowed: false, reason: "age_required" };
  return { allowed: true };
}

/** Gate for the current request (pages, routes). */
export async function gateRequest(viewer: Pick<Viewer, "id" | "role"> | null): Promise<AccessDecision> {
  const f = accessFlags();
  if (!f.geo && !f.age) return { allowed: true };
  const country = countryFrom(await headers(), env().TRUSTED_PROXY as TrustedProxy);
  return evaluateAccess(viewer, country);
}
