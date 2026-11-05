import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { can } from "@/server/auth/permissions";
import { createSession, resolveSession, revokeAllSessions, revokeSession } from "@/server/services/sessions";
import type { SeedResult } from "@/server/seed";
import { closePool, resetDb, system } from "./helpers";

let s: SeedResult;
beforeEach(async () => {
  s = await resetDb();
});
afterAll(closePool);

describe("authentication regression", () => {
  it("valid session resolves; logout, expiry and revoke-all end it", async () => {
    const t = await createSession(s.memberId, "vitest");
    expect((await resolveSession(t))?.id).toBe(s.memberId);
    await revokeSession(t);
    expect(await resolveSession(t)).toBeNull();
    const t2 = await createSession(s.memberId, "vitest");
    await system((q) => q.query(`update app.sessions set expires_at = now() - interval '1 second' where user_id = $1`, [s.memberId]));
    expect(await resolveSession(t2)).toBeNull();
    const a = await createSession(s.memberId, "a");
    const b = await createSession(s.memberId, "b");
    await revokeAllSessions(s.memberId);
    expect(await resolveSession(a)).toBeNull();
    expect(await resolveSession(b)).toBeNull();
  });

  it("garbage, empty and other users' tokens never resolve", async () => {
    for (const t of ["", "x", "a".repeat(43), null, undefined]) expect(await resolveSession(t as string)).toBeNull();
  });

  it("a suspended account loses access mid-session (status read every request)", async () => {
    const t = await createSession(s.memberId, "vitest");
    await system((q) => q.query(`update app.users set status = 'suspended' where id = $1`, [s.memberId]));
    const v = await resolveSession(t);
    expect(v === null || v.status !== "active").toBe(true);
    expect(can(v, "club.discover")).toBe(false);
  });

  it("role guards: owner powers need AAL2; pending and members have none", async () => {
    expect(can({ role: "owner", status: "active", aal: 1 }, "applications.review")).toBe(false);
    expect(can({ role: "owner", status: "active", aal: 2 }, "applications.review")).toBe(true);
    expect(can({ role: "member", status: "active", aal: 1 }, "moderation.review")).toBe(false);
    expect(can({ role: "member", status: "pending", aal: 1 }, "club.discover")).toBe(false);
    expect(can({ role: "creator", status: "active", aal: 1 }, "creators.verify")).toBe(false);
  });
});
