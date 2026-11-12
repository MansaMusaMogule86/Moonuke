import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetEnvCache } from "@/server/env";
import { myReferralCount, referralCreator, registerFanViaReferral } from "@/server/services/creatorReferral";
import type { SeedResult } from "@/server/seed";
import { closePool, meta, resetDb, system, viewer } from "./helpers";

let s: SeedResult;
beforeEach(async () => {
  s = await resetDb();
});
afterEach(() => vi.unstubAllEnvs());
afterAll(closePool);

const setFlag = (v: "on" | "off") => {
  vi.stubEnv("FEATURE_CREATOR_REFERRALS", v);
  _resetEnvCache();
};
const input = { alias: "New Fan", email: "fan.new@example.test", password: "a-long-enough-password" };

describe("creator referral links (fan sign-up)", () => {
  it("resolves only an eligible creator (listed + published + active)", async () => {
    expect((await referralCreator("isadora"))?.handle).toBe("isadora");
    expect(await referralCreator("does-not-exist")).toBeNull();
    expect(await referralCreator("not a handle")).toBeNull();
    // A discreet creator is never reachable through the link.
    await system((q) => q.query(`update app.creators set visibility = 'discreet' where user_id = $1`, [s.creatorIds.zara]));
    expect(await referralCreator("zara")).toBeNull();
  });

  it("refuses sign-up while the flag is off", async () => {
    setFlag("off");
    await expect(registerFanViaReferral("isadora", input, meta)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("creates an active FAN account (never a creator) and records the referral", async () => {
    setFlag("on");
    const r = await registerFanViaReferral("isadora", input, meta);
    expect(r.handle).toBe("isadora");
    const u = await system((q) => q.one<{ id: string; role: string; status: string }>(`select id, role, status from app.users where email = $1`, [input.email]));
    expect(u).toMatchObject({ role: "member", status: "active" });
    const ref = await system((q) => q.one<{ creator_id: string }>(`select creator_id from app.creator_referrals where user_id = $1`, [u!.id]));
    expect(ref!.creator_id).toBe(s.creatorIds.isadora);
    expect((await viewer(u!.id)).role).toBe("member");
  });

  it("a tampered handle or a suspended creator cannot create an account", async () => {
    setFlag("on");
    await expect(registerFanViaReferral("not-a-creator", input, meta)).rejects.toMatchObject({ code: "not_found" });
    await system((q) => q.query(`update app.users set status = 'suspended' where id = $1`, [s.creatorIds.isadora]));
    await expect(registerFanViaReferral("isadora", input, meta)).rejects.toMatchObject({ code: "not_found" });
  });

  it("the creator sees only their own referral count; a member sees nothing", async () => {
    setFlag("on");
    await registerFanViaReferral("isadora", input, meta);
    expect(await myReferralCount(await viewer(s.creatorIds.isadora))).toBe(1);
    expect(await myReferralCount(await viewer(s.creatorIds.zara))).toBe(0);
    await expect(myReferralCount(await viewer(s.memberId))).rejects.toMatchObject({ code: "forbidden" });
  });
});
