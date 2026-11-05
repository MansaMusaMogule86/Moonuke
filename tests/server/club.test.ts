import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { discover, getEntitledMedia, getProfile, quote, setFollow } from "@/server/services/club";
import { signMediaUrl, verifyMediaSignature } from "@/server/media/sign";
import type { SeedResult } from "@/server/seed";
import { asViewer, closePool, resetDb, rlsError, viewer } from "./helpers";

let s: SeedResult;
beforeAll(async () => {
  s = await resetDb();
});
afterAll(closePool);

describe("discovery", () => {
  it("lists only listed creators — never discreet or private", async () => {
    const v = await viewer(s.member2Id);
    const all = await discover(v, {});
    const handles = all.map((c) => c.handle);
    expect(handles).toContain("isadora");
    expect(handles).not.toContain("amaya"); // discreet
    expect(handles).not.toContain("orsolya"); // private
    expect(all).toHaveLength(10);
  });

  it("searches across name, discipline and city, with LIKE wildcards escaped", async () => {
    const v = await viewer(s.member2Id);
    expect((await discover(v, { q: "lisbon" })).map((c) => c.handle)).toEqual(["kaiasol"]);
    expect((await discover(v, { q: "compos" })).map((c) => c.handle)).toEqual(["valentin"]);
    expect(await discover(v, { q: "%" })).toHaveLength(0);
    expect(await discover(v, { q: "_" })).toHaveLength(0);
  });

  it("filters by category and sorts", async () => {
    const v = await viewer(s.member2Id);
    const music = await discover(v, { category: "music" });
    expect(music.map((c) => c.handle).sort()).toEqual(["selene", "valentin"]);
    const byMembers = await discover(v, { sort: "members" });
    expect(byMembers[0].members).toBeGreaterThanOrEqual(byMembers[byMembers.length - 1].members);
  });

  it("anonymous viewers see nothing through RLS", async () => {
    expect(await asViewer(null, (q) => q.query(`select * from app.creators`))).toHaveLength(0);
    expect(await asViewer(null, (q) => q.query(`select * from app.posts`))).toHaveLength(0);
  });
});

describe("profile visibility", () => {
  it("a discreet profile is reachable by handle but not discoverable", async () => {
    expect(await getProfile(await viewer(s.member2Id), "amaya")).not.toBeNull();
  });

  it("a private profile is visible only to its subscribers", async () => {
    expect(await getProfile(await viewer(s.member2Id), "orsolya")).toBeNull();
    expect(await getProfile(await viewer(s.memberId), "orsolya")).not.toBeNull();
  });

  it("unknown handles and invalid handles return null", async () => {
    const v = await viewer(s.member2Id);
    expect(await getProfile(v, "nobody_here")).toBeNull();
    expect(await getProfile(v, "'; drop table app.users; --")).toBeNull();
  });
});

describe("entitlements", () => {
  it("a non-subscriber gets free previews only; locked bodies and media are absent", async () => {
    const p = (await getProfile(await viewer(s.member2Id), "isadora"))!;
    for (const post of p.posts) {
      expect(post.unlocked).toBe(post.access === "preview");
      if (!post.unlocked) {
        expect(post.body).toBeUndefined();
        expect(post.media).toBeUndefined();
      }
    }
    expect(JSON.stringify(p)).not.toContain("For members: the full story");
    expect(JSON.stringify(p)).not.toContain("For the VIP room only");
  });

  it("a VIP sees members + VIP posts but not PPV", async () => {
    const p = (await getProfile(await viewer(s.memberId), "isadora"))!;
    expect(p.viewer.tier).toBe("vip");
    const by = (a: string) => p.posts.filter((x) => x.access === a);
    expect(by("members").every((x) => x.unlocked)).toBe(true);
    expect(by("vip").every((x) => x.unlocked)).toBe(true);
    expect(by("ppv").every((x) => !x.unlocked)).toBe(true);
  });

  it("a member-tier subscriber does not get VIP posts", async () => {
    const p = (await getProfile(await viewer(s.memberId), "zara"))!;
    expect(p.posts.filter((x) => x.access === "vip").every((x) => !x.unlocked)).toBe(true);
    expect(p.posts.filter((x) => x.access === "members").every((x) => x.unlocked)).toBe(true);
  });

  it("a PPV purchase unlocks exactly that post", async () => {
    const p = (await getProfile(await viewer(s.memberId), "mireille"))!;
    expect(p.posts.filter((x) => x.unlocked).map((x) => x.access).sort()).toEqual(["ppv", "preview", "preview"]);
  });

  it("RLS hides locked post_content even from direct queries", async () => {
    const rows = await asViewer(s.member2Id, (q) =>
      q.query<{ access: string }>(`select p.access from app.post_content pc join app.posts p on p.id = pc.post_id where p.creator_id = $1`, [s.creatorIds.isadora]),
    );
    expect(rows.map((r) => r.access).every((a) => a === "preview")).toBe(true);
  });

  it("subscriptions and purchases cannot be written by the app role", async () => {
    expect(await rlsError(s.member2Id, `insert into app.purchases (fan_id, post_id) select $1, id from app.posts limit 1`, [s.member2Id])).toBe("42501");
    expect(await rlsError(s.member2Id, `insert into app.subscriptions (fan_id, creator_id, tier_id, current_period_end) select $1, creator_id, id, now() + interval '1 day' from app.tiers limit 1`, [s.member2Id])).toBe("42501");
  });
});

describe("media", () => {
  it("signed URLs are bound to viewer, asset and expiry", async () => {
    const url = signMediaUrl("post-1", 0, "viewer-1", 1_000_000_000_000);
    const u = new URL(url, "http://x");
    const exp = Number(u.searchParams.get("exp"));
    const sig = u.searchParams.get("sig")!;
    expect(verifyMediaSignature("post-1", 0, "viewer-1", exp, sig, 1_000_000_000_000)).toBe(true);
    expect(verifyMediaSignature("post-1", 0, "viewer-2", exp, sig, 1_000_000_000_000)).toBe(false);
    expect(verifyMediaSignature("post-1", 1, "viewer-1", exp, sig, 1_000_000_000_000)).toBe(false);
    expect(verifyMediaSignature("post-1", 0, "viewer-1", exp, sig, 1_000_000_000_000 + 6 * 60_000)).toBe(false);
  });

  it("media lookup re-checks entitlement", async () => {
    const vip = (await getProfile(await viewer(s.memberId), "isadora"))!;
    const vipPost = vip.posts.find((x) => x.access === "vip")!;
    expect(await getEntitledMedia(await viewer(s.memberId), vipPost.id, 0)).not.toBeNull();
    expect(await getEntitledMedia(await viewer(s.member2Id), vipPost.id, 0)).toBeNull();
  });
});

describe("follow & checkout quotes", () => {
  it("follow/unfollow works only for visible creators", async () => {
    const v = await viewer(s.member2Id);
    await setFollow(v, s.creatorIds.isadora, true);
    expect((await getProfile(v, "isadora"))!.viewer.following).toBe(true);
    await setFollow(v, s.creatorIds.isadora, false);
    expect((await getProfile(v, "isadora"))!.viewer.following).toBe(false);
    await expect(setFollow(v, s.creatorIds.orsolya, true)).rejects.toMatchObject({ code: "not_found" });
  });

  it("quotes come from the database and are never purchasable", async () => {
    const v = await viewer(s.member2Id);
    const p = (await getProfile(v, "isadora"))!;
    const vip = p.tiers.find((t) => t.kind === "vip")!;
    const qt = await quote(v, { kind: "tier", id: vip.id });
    expect(qt).toMatchObject({ amountLabel: "$48", available: false });
    const ppv = p.posts.find((x) => x.access === "ppv")!;
    expect(await quote(v, { kind: "post", id: ppv.id })).toMatchObject({ amountLabel: "$12", available: false });
    const preview = p.posts.find((x) => x.access === "preview")!;
    await expect(quote(v, { kind: "post", id: preview.id })).rejects.toMatchObject({ code: "validation" });
  });

  it("a hidden creator's tier cannot be quoted", async () => {
    const owner = await viewer(s.memberId);
    const priv = (await getProfile(owner, "orsolya"))!;
    await expect(quote(await viewer(s.member2Id), { kind: "tier", id: priv.tiers[0].id })).rejects.toMatchObject({ code: "not_found" });
  });
});
