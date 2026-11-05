import "server-only";
import { system } from "@/server/db";
import { hashPassword, randomToken, sha256 } from "@/server/auth/crypto";
import { categories, creators, memberPerks, postsFor, vipPerks } from "./data";

export const DEV_PASSWORD = "moonuke-dev-password";

export type SeedResult = {
  ownerId: string;
  memberId: string; // Nocturne: VIP of isadora, member of zara, bought mireille PPV, member of orsolya (private)
  member2Id: string; // Velvet Hour: active, no subscriptions
  pendingId: string; // Satellite: awaiting approval
  creatorIds: Record<string, string>;
  inviteToken: string; // active, 3 uses, member
  creatorInviteToken: string; // active, 1 use, creator
};

/**
 * DEV/TEST ONLY. Populates an empty, migrated database.
 * Refuses to run in production.
 */
export async function seed(): Promise<SeedResult> {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed in production.");
  const pw = await hashPassword(DEV_PASSWORD);

  return system(async (q) => {
    const user = async (email: string, alias: string, role: string, status: string) =>
      (await q.one<{ id: string }>(
        `insert into app.users (email, password_hash, role, status, alias, adult_attested_at, approved_at)
         values ($1, $2, $3::app.user_role, $4::text::app.user_status, $5, now(), case when $4::text = 'active' then now() end) returning id`,
        [email, pw, role, status, alias],
      ))!.id;

    const ownerId = await user("owner@moonuke.test", "The House", "owner", "active");
    const memberId = await user("nocturne@moonuke.test", "Nocturne", "member", "active");
    const member2Id = await user("velvet@moonuke.test", "Velvet Hour", "member", "active");

    for (const c of categories) {
      await q.query(`insert into app.categories (slug, label, sort) values ($1, $2, $3)`, [c.slug, c.label, c.sort]);
    }

    const creatorIds: Record<string, string> = {};
    const tierIds: Record<string, { member: string; vip: string }> = {};
    const postIds: Record<string, string[]> = {};
    for (const [i, c] of creators.entries()) {
      const id = await user(`${c.handle}@moonuke.test`, c.name, "creator", "active");
      creatorIds[c.handle] = id;
      await q.query(
        `insert into app.creators (user_id, handle, display_name, discipline, category, city, tagline, bio, visibility, featured, cover, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now() - make_interval(days => $12))`,
        [id, c.handle, c.name, c.discipline, c.category, c.city, c.tagline, c.bio, c.visibility ?? "listed", !!c.featured, JSON.stringify(c.study), i * 9],
      );
      const m = await q.one<{ id: string }>(
        `insert into app.tiers (creator_id, kind, name, price_cents, perks, sort) values ($1, 'member', 'Member', $2, $3, 1) returning id`,
        [id, c.memberCents, memberPerks],
      );
      const v = await q.one<{ id: string }>(
        `insert into app.tiers (creator_id, kind, name, price_cents, seat_limit, perks, sort) values ($1, 'vip', 'VIP', $2, $3, $4, 2) returning id`,
        [id, c.vipCents, c.vipSeats ?? null, vipPerks],
      );
      tierIds[c.handle] = { member: m!.id, vip: v!.id };
      postIds[c.handle] = [];
      for (const p of postsFor(c.study)) {
        const post = await q.one<{ id: string }>(
          `insert into app.posts (creator_id, access, price_cents, teaser, media_kind, media_count, published_at)
           values ($1, $2, $3, $4, $5, $6, now() - make_interval(days => $7)) returning id`,
          [id, p.access, p.priceCents ?? null, p.teaser, p.kind, p.count, p.daysAgo],
        );
        await q.query(`insert into app.post_content (post_id, body, media) values ($1, $2, $3)`, [post!.id, p.body, JSON.stringify(p.media)]);
        postIds[c.handle].push(post!.id);
      }
    }

    const sub = (fan: string, handle: string, kind: "member" | "vip") =>
      q.query(
        `insert into app.subscriptions (fan_id, creator_id, tier_id, current_period_end) values ($1, $2, $3, now() + interval '30 days')`,
        [fan, creatorIds[handle], tierIds[handle][kind]],
      );
    await sub(memberId, "isadora", "vip");
    await sub(memberId, "zara", "member");
    await sub(memberId, "orsolya", "member");
    // Background members so counts look alive
    for (let n = 0; n < 6; n++) {
      const fid = await user(`fan${n}@moonuke.test`, `Guest ${n + 1}`, "member", "active");
      await sub(fid, ["isadora", "kaiasol", "zara", "noor", "isadora", "aurelio"][n], n % 2 ? "vip" : "member");
    }
    // PPV purchase: mireille's ppv post is index 3
    await q.query(`insert into app.purchases (fan_id, post_id) values ($1, $2)`, [memberId, postIds.mireille[3]]);
    await q.query(`insert into app.follows (fan_id, creator_id) values ($1, $2), ($1, $3)`, [memberId, creatorIds.kaiasol, creatorIds.valentin]);

    // Invitations
    const inviteToken = randomToken();
    const inv = await q.one<{ id: string }>(
      `insert into app.invitations (token_hash, intended_role, max_uses, expires_at, note, created_by)
       values ($1, 'member', 3, now() + interval '7 days', 'Dev seed — members', $2) returning id`,
      [sha256(inviteToken), ownerId],
    );
    const creatorInviteToken = randomToken();
    await q.query(
      `insert into app.invitations (token_hash, intended_role, max_uses, expires_at, note, created_by)
       values ($1, 'creator', 1, now() + interval '7 days', 'Dev seed — creator', $2)`,
      [sha256(creatorInviteToken), ownerId],
    );

    // A pending applicant who came through the member invitation
    const pendingId = await user("satellite@moonuke.test", "Satellite", "member", "pending");
    await q.query(`update app.users set invitation_id = $2 where id = $1`, [pendingId, inv!.id]);
    await q.query(`update app.invitations set use_count = 1 where id = $1`, [inv!.id]);
    await q.query(`insert into app.applications (user_id, invitation_id) values ($1, $2)`, [pendingId, inv!.id]);

    // A pending referral request from Nocturne
    await q.query(
      `insert into app.referral_requests (requester_id, invitee_name, invitee_email, intended_role, relationship)
       values ($1, 'Celeste', 'celeste@example.com', 'member', 'A close friend from Paris — collects couture and has followed Isadora for years.')`,
      [memberId],
    );

    await q.query(`insert into app.audit_log (actor_id, action, metadata) values ($1, 'seed.run', '{"env":"dev"}')`, [ownerId]);

    return { ownerId, memberId, member2Id, pendingId, creatorIds, inviteToken, creatorInviteToken };
  });
}
