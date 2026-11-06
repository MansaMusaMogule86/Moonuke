import "server-only";
import { randomUUID } from "node:crypto";
import { asViewer, system } from "@/server/db";
import { can, type Viewer } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import { requireFeature } from "@/server/flags";
import { isProd } from "@/server/env";
import type { AgeProvider } from "@/server/compliance/ageProvider";
import { audit } from "./audit";

// =====================================================================
// Age checks and regional rules (INACTIVE until approved).
// =====================================================================

/** How long a passed check stays valid. UNKNOWN (legal): null = no expiry. */
export const AGE_CHECK_VALIDITY_DAYS: number | null = null;

type Opts = { testing?: boolean };
const gate = (o: Opts) => {
  if (o.testing && !isProd()) return;
  requireFeature("age_assurance");
};

export async function startAgeCheck(v: Viewer, provider: AgeProvider, o: Opts = {}): Promise<{ checkId: string; path: string }> {
  gate(o);
  if (v.status !== "active") throw new AppError("forbidden", "Not allowed.");
  const id = randomUUID();
  await system(async (q) => {
    const open = await q.one<{ n: number }>(`select count(*)::int as n from app.age_checks where user_id = $1 and status = 'pending' and created_at > now() - interval '1 hour'`, [v.id]);
    if ((open?.n ?? 0) >= 5) throw new AppError("rate_limited", "Too many checks started. Try again later.");
    await q.query(`insert into app.age_checks (id, user_id, provider) values ($1, $2, $3)`, [id, v.id, provider.id]);
    await audit(q, { actorId: v.id, action: "age.check_start", targetType: "age_check", targetId: id, metadata: { provider: provider.id } });
  });
  return { checkId: id, path: provider.start(id).path };
}

/**
 * Apply a provider's signed result. Idempotent for the same result; a result
 * can't be applied to another check or reused (unique provider reference).
 */
export async function completeAgeCheck(provider: AgeProvider, rawBody: string, signature: string | null, o: Opts = {}): Promise<"passed" | "failed"> {
  gate(o);
  const r = provider.verify(rawBody, signature);
  if (!r) throw new AppError("validation", "Invalid result.");
  return system(async (q) => {
    const c = await q.one<{ user_id: string; status: string; provider_ref: string | null }>(`select user_id, status, provider_ref from app.age_checks where id = $1 and provider = $2 for update`, [r.checkId, provider.id]);
    if (!c) throw new AppError("not_found", "Unknown check.");
    if (c.status !== "pending") {
      if (c.provider_ref === r.providerRef) return c.status as "passed" | "failed";
      throw new AppError("conflict", "This check was already decided.");
    }
    try {
      await q.query(
        `update app.age_checks set status = $2, provider_ref = $3, method = $4, assurance = $5, decided_at = now(),
                expires_at = case when $6::int is null then null else now() + make_interval(days => $6::int) end
          where id = $1`,
        [r.checkId, r.result, r.providerRef, r.method.slice(0, 60), r.assurance, AGE_CHECK_VALIDITY_DAYS],
      );
    } catch (e) {
      if ((e as { code?: string }).code === "23505") throw new AppError("conflict", "This result was already used.");
      throw e;
    }
    await audit(q, { actorId: c.user_id, action: r.result === "passed" ? "age.check_passed" : "age.check_failed", targetType: "age_check", targetId: r.checkId, metadata: { provider: provider.id, assurance: r.assurance } });
    return r.result;
  });
}

export async function myAgeStatus(v: Viewer): Promise<{ passed: boolean; lastStatus: string | null }> {
  return asViewer(v, async (q) => {
    const r = await q.one<{ passed: boolean; last: string | null }>(
      `select exists (select 1 from app.age_checks where user_id = $1 and status = 'passed' and (expires_at is null or expires_at > now())) as passed,
              (select status from app.age_checks where user_id = $1 order by created_at desc limit 1) as last`,
      [v.id],
    );
    return { passed: !!r?.passed, lastStatus: r?.last ?? null };
  });
}

// ---------------------------------------------------------------- owner: rules

function assertOwner(v: Viewer) {
  if (!can(v, "moderation.review")) throw new AppError("forbidden", "Not allowed.");
}

export type Rule = { country: string; rule: "block" | "age_assurance"; note: string | null; updated_at: Date };
export async function listRules(v: Viewer): Promise<{ rules: Rule[]; scope: "listed" | "everywhere" }> {
  assertOwner(v);
  return asViewer(v, async (q) => ({
    rules: await q.query<Rule>(`select country, rule, note, updated_at from app.jurisdiction_rules order by country`),
    scope: (await q.one<{ s: "listed" | "everywhere" }>(`select app.age_assurance_scope() as s`))!.s,
  }));
}

export async function setRule(v: Viewer, country: string, rule: "block" | "age_assurance", note?: string) {
  assertOwner(v);
  const c = country.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) throw new AppError("validation", "Use a two-letter country code (XX = unknown).", "country");
  if (rule !== "block" && rule !== "age_assurance") throw new AppError("validation", "Choose a rule.", "rule");
  await asViewer(v, async (q) => {
    await q.query(
      `insert into app.jurisdiction_rules (country, rule, note, updated_by) values ($1, $2, $3, $4)
       on conflict (country) do update set rule = excluded.rule, note = excluded.note, updated_by = excluded.updated_by, updated_at = now()`,
      [c, rule, note?.trim().slice(0, 300) || null, v.id],
    );
    await audit(q, { actorId: v.id, action: "access.rule_set", targetType: "country", metadata: { country: c, rule } });
  });
}

export async function removeRule(v: Viewer, country: string) {
  assertOwner(v);
  await asViewer(v, async (q) => {
    await q.query(`delete from app.jurisdiction_rules where country = $1`, [country.toUpperCase()]);
    await audit(q, { actorId: v.id, action: "access.rule_remove", targetType: "country", metadata: { country: country.toUpperCase() } });
  });
}

export async function setAgeScope(v: Viewer, scope: "listed" | "everywhere") {
  assertOwner(v);
  if (scope !== "listed" && scope !== "everywhere") throw new AppError("validation", "Choose where age checks apply.");
  await asViewer(v, (q) => q.query(`select app.set_age_assurance_scope($1)`, [scope]));
}
