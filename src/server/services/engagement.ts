import "server-only";
import { randomUUID } from "node:crypto";
import { asViewer } from "@/server/db";
import type { Viewer } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import { audit } from "./audit";
import { deliverNotification } from "./notifications";

function assertFan(v: Viewer) {
  if (!(v.role === "member" || v.role === "creator") || v.status !== "active") {
    throw new AppError("forbidden", "Not allowed.");
  }
}

function assertCreator(v: Viewer) {
  if (v.role !== "creator" || v.status !== "active") throw new AppError("forbidden", "Creator account required.");
}

export async function likePost(viewer: Viewer, postId: string): Promise<{ liked: boolean; likes: number }> {
  assertFan(viewer);
  return asViewer(viewer, async (q) => {
    const ok = await q.one<{ ok: boolean }>(`select app.can_view_post($1) as ok`, [postId]);
    if (!ok?.ok) throw new AppError("not_found", "Post not found.");
    await q.query(`insert into app.post_likes (post_id, fan_id) values ($1, $2) on conflict do nothing`, [postId, viewer.id]);
    const n = await q.one<{ n: number }>(`select count(*)::int as n from app.post_likes where post_id = $1`, [postId]);
    await audit(q, { actorId: viewer.id, action: "post.like", targetType: "post", targetId: postId });
    return { liked: true, likes: n?.n ?? 1 };
  });
}

export async function unlikePost(viewer: Viewer, postId: string): Promise<{ liked: boolean; likes: number }> {
  assertFan(viewer);
  return asViewer(viewer, async (q) => {
    await q.query(`delete from app.post_likes where post_id = $1 and fan_id = $2`, [postId, viewer.id]);
    const n = await q.one<{ n: number }>(`select count(*)::int as n from app.post_likes where post_id = $1`, [postId]);
    return { liked: false, likes: n?.n ?? 0 };
  });
}

export type PostComment = { id: string; postId: string; authorId: string; body: string; createdAt: string };

export async function commentOnPost(viewer: Viewer, postId: string, body: string): Promise<PostComment> {
  assertFan(viewer);
  const clean = body.trim().replace(/\s+/g, " ");
  if (!clean || clean.length > 1000) throw new AppError("validation", "Keep comments between 1 and 1000 characters.", "body");
  return asViewer(viewer, async (q) => {
    const ok = await q.one<{ ok: boolean }>(`select app.can_view_post($1) as ok`, [postId]);
    if (!ok?.ok) throw new AppError("not_found", "Post not found.");
    const row = await q.one<{ id: string; created_at: Date }>(
      `insert into app.post_comments (post_id, author_id, body) values ($1, $2, $3) returning id, created_at`,
      [postId, viewer.id, clean],
    );
    await audit(q, { actorId: viewer.id, action: "post.comment", targetType: "post", targetId: postId });
    return { id: row!.id, postId, authorId: viewer.id, body: clean, createdAt: new Date(row!.created_at).toISOString() };
  });
}

export async function listComments(viewer: Viewer, postId: string): Promise<PostComment[]> {
  assertFan(viewer);
  return asViewer(viewer, async (q) => {
    const ok = await q.one<{ ok: boolean }>(`select app.can_view_post($1) as ok`, [postId]);
    if (!ok?.ok) throw new AppError("not_found", "Post not found.");
    const rows = await q.query<{ id: string; author_id: string; body: string; created_at: Date }>(
      `select id, author_id, body, created_at from app.post_comments where post_id = $1 and hidden_at is null order by created_at limit 200`,
      [postId],
    );
    return rows.map((r) => ({ id: r.id, postId, authorId: r.author_id, body: r.body, createdAt: new Date(r.created_at).toISOString() }));
  });
}

export type TipInput = {
  creatorId: string;
  amountCents: number;
  targetKind?: "creator" | "post" | "message";
  targetId?: string | null;
  idempotencyKey?: string;
};

/** Tips are quoted only while payments are inactive: no charge, no ledger movement. */
export async function sendTip(viewer: Viewer, input: TipInput): Promise<{ id: string; status: "quoted" }> {
  assertFan(viewer);
  if (!Number.isInteger(input.amountCents) || input.amountCents < 100 || input.amountCents > 100000) {
    throw new AppError("validation", "Tips are between $1 and $1,000.", "amountCents");
  }
  const key = input.idempotencyKey?.trim() || randomUUID();
  const tipId = await asViewer(viewer, async (q) => {
    const row = await q.one<{ id: string }>(
      `insert into app.tips (creator_id, fan_id, amount_cents, currency, target_kind, target_id, status, idempotency_key)
       values ($1, $2, $3, 'USD', $4, $5, 'quoted', $6)
       on conflict (idempotency_key) do update set idempotency_key = excluded.idempotency_key
       returning id`,
      [input.creatorId, viewer.id, input.amountCents, input.targetKind ?? "creator", input.targetId ?? null, key],
    );
    await audit(q, { actorId: viewer.id, action: "tip.send", targetType: "creator", targetId: input.creatorId, metadata: { amountCents: input.amountCents } });
    return row!.id;
  });
  await deliverNotification({ userId: input.creatorId, kind: "tip.received", creatorId: input.creatorId, idempotencyKey: `tip:${tipId}` });
  return { id: tipId, status: "quoted" as const };
}

export type MediaFolder = { id: string; name: string; sort: number };

export async function myFolders(viewer: Viewer): Promise<MediaFolder[]> {
  assertCreator(viewer);
  return asViewer(viewer, (q) =>
    q
      .query<{ id: string; name: string; sort: number }>(`select id, name, sort from app.media_folders where creator_id = $1 order by sort, name`, [viewer.id])
      .then((rows) => rows.map((r) => ({ id: r.id, name: r.name, sort: r.sort }))),
  );
}

export async function moveUploadToFolder(viewer: Viewer, uploadId: string, folderId: string | null): Promise<void> {
  assertCreator(viewer);
  return asViewer(viewer, async (q) => {
    const own = await q.one<{ id: string }>(`select id from app.media_uploads where id = $1 and owner_id = $2`, [uploadId, viewer.id]);
    if (!own) throw new AppError("not_found", "Upload not found.");
    if (folderId) {
      const folder = await q.one<{ id: string }>(`select id from app.media_folders where id = $1 and creator_id = $2`, [folderId, viewer.id]);
      if (!folder) throw new AppError("not_found", "Folder not found.");
    }
    await q.query(`update app.media_uploads set folder_id = $3 where id = $1 and owner_id = $2`, [uploadId, viewer.id, folderId]);
  });
}

export async function createFolder(viewer: Viewer, name: string): Promise<MediaFolder> {
  assertCreator(viewer);
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean || clean.length > 60) throw new AppError("validation", "Name folders between 1 and 60 characters.", "name");
  return asViewer(viewer, async (q) => {
    try {
      const row = await q.one<{ id: string; sort: number }>(
        `insert into app.media_folders (creator_id, name, sort)
         values ($1, $2, coalesce((select max(sort) + 1 from app.media_folders where creator_id = $1), 1))
         returning id, sort`,
        [viewer.id, clean],
      );
      return { id: row!.id, name: clean, sort: row!.sort };
    } catch (e) {
      if ((e as { code?: string }).code === "23505") throw new AppError("conflict", "You already have a folder with that name.", "name");
      throw e;
    }
  });
}

export async function attachPostMedia(viewer: Viewer, postId: string, uploadId: string): Promise<void> {
  assertCreator(viewer);
  return asViewer(viewer, async (q) => {
    const post = await q.one<{ id: string }>(`select id from app.posts where id = $1 and creator_id = $2`, [postId, viewer.id]);
    if (!post) throw new AppError("not_found", "Post not found.");
    const up = await q.one<{ id: string }>(`select id from app.media_uploads where id = $1 and owner_id = $2`, [uploadId, viewer.id]);
    if (!up) throw new AppError("not_found", "Upload not found.");
    await q.query(`insert into app.post_attachments (post_id, upload_id) values ($1, $2) on conflict do nothing`, [postId, uploadId]);
    await audit(q, { actorId: viewer.id, action: "post.attach", targetType: "post", targetId: postId });
  });
}

export async function detachPostMedia(viewer: Viewer, postId: string, uploadId: string): Promise<void> {
  assertCreator(viewer);
  return asViewer(viewer, async (q) => {
    await q.query(`delete from app.post_attachments where post_id = $1 and upload_id = $2 and exists (select 1 from app.posts p where p.id = $1 and p.creator_id = $3)`, [
      postId,
      uploadId,
      viewer.id,
    ]);
  });
}

export async function listPostAttachments(viewer: Viewer, postId: string): Promise<string[]> {
  assertFan(viewer);
  return asViewer(viewer, async (q) => {
    const ok = await q.one<{ ok: boolean }>(`select app.can_view_post($1) as ok`, [postId]);
    const own = await q.one<{ id: string }>(`select id from app.posts where id = $1 and creator_id = $2`, [postId, viewer.id]);
    if (!ok?.ok && !own) throw new AppError("not_found", "Post not found.");
    return (await q.query<{ upload_id: string }>(`select upload_id from app.post_attachments where post_id = $1 order by sort, created_at`, [postId])).map(
      (r) => r.upload_id,
    );
  });
}

export async function attachMessageMedia(viewer: Viewer, messageId: string, uploadId: string): Promise<void> {
  assertFan(viewer);
  return asViewer(viewer, async (q) => {
    const msg = await q.one<{ id: string }>(`select id from app.messages where id = $1 and sender_id = $2`, [messageId, viewer.id]);
    if (!msg) throw new AppError("not_found", "Message not found.");
    const up = await q.one<{ id: string }>(`select id from app.media_uploads where id = $1 and owner_id = $2`, [uploadId, viewer.id]);
    if (!up) throw new AppError("not_found", "Upload not found.");
    await q.query(`insert into app.message_attachments (message_id, upload_id) values ($1, $2) on conflict do nothing`, [messageId, uploadId]);
  });
}

export async function detachMessageMedia(viewer: Viewer, messageId: string, uploadId: string): Promise<void> {
  assertFan(viewer);
  return asViewer(viewer, async (q) => {
    await q.query(`delete from app.message_attachments where message_id = $1 and upload_id = $2 and exists (select 1 from app.messages m where m.id = $1 and m.sender_id = $3)`, [
      messageId,
      uploadId,
      viewer.id,
    ]);
  });
}

export async function listMessageAttachments(viewer: Viewer, messageId: string): Promise<string[]> {
  assertFan(viewer);
  return asViewer(viewer, async (q) => {
    const rows = await q.query<{ upload_id: string }>(`select upload_id from app.message_attachments where message_id = $1`, [messageId]);
    return rows.map((r) => r.upload_id);
  });
}
