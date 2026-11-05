import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ANALYTICS_WEEKS, createPost, myAnalytics } from "@/server/services/studio";
import type { SeedResult } from "@/server/seed";
import { asViewer, closePool, resetDb, system, viewer } from "./helpers";

let s: SeedResult;
beforeEach(async () => {
  s = await resetDb();
});
afterAll(closePool);

describe("creator analytics (existing data, aggregates only)", () => {
  it("counts members, followers, posts by state and PPV unlocks for the creator only", async () => {
    const mireille = await viewer(s.creatorIds.mireille);
    await createPost(mireille, { access: "members", teaser: "Draft for stats", mediaKind: "image", publish: "draft" });
    await createPost(mireille, { access: "ppv", priceCents: 900, teaser: "Later PPV", mediaKind: "image", publish: "schedule", scheduleAt: new Date(Date.now() + 86_400_000) });
    const a = await myAnalytics(mireille);
    const truth = await system((q) =>
      q.one<{ active: number; followers: number; published: number; unlocks: number }>(
        `select (select count(*)::int from app.subscriptions where creator_id = $1 and status = 'active' and current_period_end > now()) as active,
                (select count(*)::int from app.follows where creator_id = $1) as followers,
                (select count(*)::int from app.posts where creator_id = $1 and published_at <= now()) as published,
                (select count(*)::int from app.purchases x join app.posts p on p.id = x.post_id where p.creator_id = $1) as unlocks`,
        [mireille.id],
      ),
    );
    expect(a.members.active).toBe(truth!.active);
    expect(a.followers.total).toBe(truth!.followers);
    expect(a.posts).toMatchObject({ published: truth!.published, scheduled: 1, draft: 1 });
    expect(a.unlocks.reduce((n, u) => n + u.unlocks, 0)).toBe(truth!.unlocks);
    expect(a.unlocks.find((u) => u.teaser === "Later PPV")?.unlocks).toBe(0);
    expect(a.weeks).toHaveLength(ANALYTICS_WEEKS);
    // Aggregates only: nothing in the payload names or identifies a fan.
    const json = JSON.stringify(a);
    for (const id of [s.memberId, s.member2Id]) expect(json).not.toContain(id);
    expect(json).not.toMatch(/nocturne|velvet|@moonuke\.test/i);
  });

  it("only creators get analytics; the unlock helper never reveals other creators' posts", async () => {
    await expect(myAnalytics(await viewer(s.memberId))).rejects.toMatchObject({ code: "forbidden" });
    await expect(myAnalytics(await viewer(s.ownerId))).rejects.toMatchObject({ code: "forbidden" });
    // Direct RLS: members and other creators get no rows from the helper; purchases stay unreadable to creators.
    expect(await asViewer({ id: s.memberId, aal: 1 }, (q) => q.query(`select * from app.my_post_unlocks()`))).toHaveLength(0);
    const zaraRows = await asViewer({ id: s.creatorIds.zara, aal: 1 }, (q) => q.query<{ post_id: string }>(`select post_id from app.my_post_unlocks()`));
    const zaraPosts = await system((q) => q.query<{ id: string }>(`select id from app.posts where creator_id = $1`, [s.creatorIds.zara]));
    expect(zaraRows.every((r) => zaraPosts.some((p) => p.id === r.post_id))).toBe(true);
    expect(await asViewer({ id: s.creatorIds.mireille, aal: 1 }, (q) => q.query(`select * from app.purchases`))).toHaveLength(0);
  });
});
