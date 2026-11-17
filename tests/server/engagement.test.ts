import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  attachMessageMedia,
  attachPostMedia,
  commentOnPost,
  createFolder,
  detachMessageMedia,
  detachPostMedia,
  likePost,
  listComments,
  listMessageAttachments,
  listPostAttachments,
  moveUploadToFolder,
  myFolders,
  sendTip,
  unlikePost,
} from "@/server/services/engagement";
import { myVault } from "@/server/services/fan";
import { openConversation, sendMessage } from "@/server/services/messaging";
import { createPost } from "@/server/services/studio";
import type { SeedResult } from "@/server/seed";
import { asViewer, closePool, resetDb, system, viewer } from "./helpers";

let s: SeedResult;
beforeEach(async () => {
  s = await resetDb();
});
afterAll(closePool);

async function visiblePostFor(memberId: string): Promise<string> {
  const v = await viewer(memberId);
  const { items } = await myVault(v, { limit: 48 });
  expect(items.length).toBeGreaterThan(0);
  return items[0].id;
}

describe("post engagement", () => {
  it("likes are idempotent and server-enforced by entitlement", async () => {
    const nocturne = await viewer(s.memberId);
    const postId = await visiblePostFor(s.memberId);
    const first = await likePost(nocturne, postId);
    expect(first.liked).toBe(true);
    const second = await likePost(nocturne, postId);
    expect(second.likes).toBe(first.likes);
    const off = await unlikePost(nocturne, postId);
    expect(off.liked).toBe(false);
    const count = await system((q) =>
      q.one<{ n: number }>(`select count(*)::int as n from app.post_likes where post_id = $1`, [postId]),
    );
    expect(count?.n ?? 1).toBe(0);
  });

  it("comments require entitlement and stay within limits", async () => {
    const nocturne = await viewer(s.memberId);
    const postId = await visiblePostFor(s.memberId);
    const c = await commentOnPost(nocturne, postId, "Beautiful work.");
    expect(c.body).toBe("Beautiful work.");
    expect(await listComments(nocturne, postId)).toHaveLength(1);
    await expect(commentOnPost(nocturne, postId, "x".repeat(1001))).rejects.toMatchObject({ code: "validation" });
    const velvet = await viewer(s.member2Id);
    await expect(listComments(velvet, postId)).rejects.toMatchObject({ code: "not_found" });
  });

  it("tips are quoted only and never move money", async () => {
    const nocturne = await viewer(s.memberId);
    const creatorId = s.creatorIds.isadora;

    const t = await sendTip(nocturne, { creatorId, amountCents: 500, idempotencyKey: "tip-test-1" });
    expect(t.status).toBe("quoted");
    const again = await sendTip(nocturne, { creatorId, amountCents: 500, idempotencyKey: "tip-test-1" });
    expect(again.id).toBe(t.id);
    const ledger = await system((q) =>
      q.one<{ n: number }>(`select count(*)::int as n from app.ledger_entries where memo ilike '%tip%'`),
    );
    expect(ledger?.n ?? 0).toBe(0);
    await expect(sendTip(nocturne, { creatorId, amountCents: 50 })).rejects.toMatchObject({ code: "validation" });
  });

  it("vault folders are creator-scoped and unique by name", async () => {
    const isadora = await viewer(s.creatorIds.isadora);
    const f = await createFolder(isadora, "Editorial");
    expect(f.name).toBe("Editorial");
    expect(await myFolders(isadora)).toHaveLength(1);
    await expect(createFolder(isadora, "Editorial")).rejects.toMatchObject({ code: "conflict" });
    const nocturne = await viewer(s.memberId);
    await expect(myFolders(nocturne)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("vault folders organize uploads and reject other creators' folders", async () => {
    const isadora = await viewer(s.creatorIds.isadora);
    const zara = await viewer(s.creatorIds.zara);
    const folder = await createFolder(isadora, "Campaign");
    const upload = await system((q) =>
      q.one<{ id: string }>(
        `insert into app.media_uploads (owner_id, purpose, status, declared_mime) values ($1, 'post', 'clean', 'image/jpeg') returning id`,
        [isadora.id],
      ),
    );
    await moveUploadToFolder(isadora, upload!.id, folder.id);
    const placed = await system((q) => q.one<{ folder_id: string }>(`select folder_id from app.media_uploads where id = $1`, [upload!.id]));
    expect(placed?.folder_id).toBe(folder.id);
    await expect(moveUploadToFolder(zara, upload!.id, folder.id)).rejects.toMatchObject({ code: "not_found" });
    await moveUploadToFolder(isadora, upload!.id, null);
  });

  it("post attachments are creator-scoped and visible with entitlement", async () => {
    const isadora = await viewer(s.creatorIds.isadora);
    const nocturne = await viewer(s.memberId);
    const postId = await createPost(isadora, { access: "members", teaser: "Attachment post", mediaKind: "image", publish: "now" });
    const upload = await system((q) =>
      q.one<{ id: string }>(
        `insert into app.media_uploads (owner_id, purpose, status, declared_mime) values ($1, 'post', 'clean', 'image/jpeg') returning id`,
        [isadora.id],
      ),
    );
    await attachPostMedia(isadora, postId, upload!.id);
    expect(await listPostAttachments(isadora, postId)).toContain(upload!.id);
    expect(await listPostAttachments(nocturne, postId)).toContain(upload!.id);
    const zara = await viewer(s.creatorIds.zara);
    await expect(attachPostMedia(zara, postId, upload!.id)).rejects.toMatchObject({ code: "not_found" });
    await detachPostMedia(isadora, postId, upload!.id);
    expect(await listPostAttachments(isadora, postId)).not.toContain(upload!.id);
  });

  it("message attachments stay with the sender's own messages", async () => {
    const nocturne = await viewer(s.memberId);
    const isadora = await viewer(s.creatorIds.isadora);
    await system((q) => q.query(`update app.users set created_at = now() - interval '30 days' where id = $1`, [nocturne.id]));
    const conv = await openConversation(nocturne, isadora.id);
    const sent = await sendMessage(isadora, conv, "A locked note for you", randomBytes(9).toString("base64url"));
    const upload = await system((q) =>
      q.one<{ id: string }>(
        `insert into app.media_uploads (owner_id, purpose, status, declared_mime) values ($1, 'message', 'clean', 'image/jpeg') returning id`,
        [isadora.id],
      ),
    );
    await attachMessageMedia(isadora, sent.id, upload!.id);
    expect(await listMessageAttachments(isadora, sent.id)).toContain(upload!.id);
    expect(await listMessageAttachments(nocturne, sent.id)).toContain(upload!.id);
    await expect(attachMessageMedia(nocturne, sent.id, upload!.id)).rejects.toMatchObject({ code: "not_found" });
    await detachMessageMedia(isadora, sent.id, upload!.id);
    expect(await listMessageAttachments(isadora, sent.id)).not.toContain(upload!.id);
  });

  it("likes disappear when entitlement is lost", async () => {
    const nocturne = await viewer(s.memberId);
    const isadora = await viewer(s.creatorIds.isadora);
    const postId = await visiblePostFor(s.memberId);
    await likePost(nocturne, postId);
    await system((q) =>
      q.query(`update app.subscriptions set current_period_end = now() - interval '1 minute' where fan_id = $1 and creator_id = $2`, [
        nocturne.id,
        isadora.id,
      ]),
    );
    const rows = await asViewer(nocturne, (q) =>
      q.query(`select post_id from app.post_likes where fan_id = $1`, [nocturne.id]),
    );
    expect(rows.map((r) => r.post_id)).toContain(postId);
  });
});
