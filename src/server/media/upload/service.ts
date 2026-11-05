import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { system } from "@/server/db";
import type { Viewer } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import { requireFeature } from "@/server/flags";
import { audit } from "@/server/services/audit";
import { validateFile } from "./signature";
import type { SafetyScanner, StorageAdapter } from "./types";

/**
 * Upload pipeline: authorize → validate bytes → store privately → scan →
 * clean | quarantined | rejected. Nothing is attached to a post or message
 * here; a later step may only use uploads in state 'clean'.
 *
 * Gated by FEATURE_UPLOADS (OFF; refused in production until storage and
 * content-safety scanning are approved). Tests pass `{ testing: true }` with
 * mock adapters, which only works outside production.
 */
export type Purpose = "post" | "message" | "avatar";
type Deps = { storage: StorageAdapter; scanner: SafetyScanner; testing?: boolean };

function gate(d: Deps) {
  if (d.testing && process.env.NODE_ENV !== "production") return;
  requireFeature("uploads");
}

function canUpload(v: Viewer, purpose: Purpose) {
  if (v.status !== "active") return false;
  if (purpose === "post") return v.role === "creator";
  if (purpose === "message") return v.role === "creator" || v.role === "member";
  return v.role === "creator";
}

export const UPLOAD_LIMITS = { pendingPerUser: 10, abandonAfterHours: 24 } as const;

export async function uploadMedia(viewer: Viewer, purpose: Purpose, declaredMime: string, bytes: Uint8Array, deps: Deps) {
  gate(deps);
  if (!canUpload(viewer, purpose)) throw new AppError("forbidden", "Not allowed.");
  const verdict = validateFile(bytes.subarray(0, 64), declaredMime, bytes.byteLength);
  if (!verdict.ok) throw new AppError("validation", verdict.reason, "file");

  const id = await system(async (q) => {
    const open = await q.one<{ n: number }>(`select count(*)::int as n from app.media_uploads where owner_id = $1 and status in ('pending', 'uploaded', 'scanning')`, [viewer.id]);
    if ((open?.n ?? 0) >= UPLOAD_LIMITS.pendingPerUser) throw new AppError("rate_limited", "Too many uploads in progress.");
    const key = `u/${viewer.id.replace(/-/g, "")}/${randomBytes(12).toString("hex")}`;
    const row = await q.one<{ id: string }>(
      `insert into app.media_uploads (owner_id, purpose, declared_mime, sniffed_mime, size_bytes, sha256, storage_key)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [viewer.id, purpose, declaredMime.slice(0, 100), verdict.sniffed.mime, bytes.byteLength, createHash("sha256").update(bytes).digest("hex"), key],
    );
    return { id: row!.id, key };
  });

  // Private storage first, then scan. A failure at any step leaves a state
  // the cleanup job can resolve; the object is never readable until 'clean'.
  try {
    await deps.storage.put(id.key, bytes, verdict.sniffed.mime);
    await setState(id.id, "scanning");
  } catch {
    await setState(id.id, "rejected", "storage error");
    throw new AppError("validation", "Upload failed. Please try again.");
  }
  const scan = await deps.scanner.scan(bytes, verdict.sniffed.mime);
  if (scan.verdict === "clean") {
    await setState(id.id, "clean");
  } else if (scan.verdict === "match") {
    // Quarantine: keep the object for evidence preservation; never serve it.
    await setState(id.id, "quarantined", `scanner match (${scan.list})`);
    await system((q) => audit(q, { actorId: null, action: "media.quarantined", targetType: "media", targetId: id.id, metadata: { owner: viewer.id, list: scan.list } }));
  } else {
    await setState(id.id, "uploaded", "scan pending retry");
  }
  return { id: id.id, status: scan.verdict === "clean" ? "clean" : scan.verdict === "match" ? "quarantined" : "uploaded" };
}

async function setState(id: string, status: string, reason?: string) {
  await system((q) => q.query(`update app.media_uploads set status = $2, reason = coalesce($3, reason), updated_at = now() where id = $1`, [id, status, reason ?? null]));
}

/** A short-lived URL for the OWNER of a clean upload (preview). Everyone else: not found. */
export async function previewUrl(viewer: Viewer, uploadId: string, deps: Deps) {
  gate(deps);
  const r = await system((q) => q.one<{ storage_key: string; status: string; owner_id: string }>(`select storage_key, status, owner_id from app.media_uploads where id = $1`, [uploadId]));
  if (!r || r.owner_id !== viewer.id || r.status !== "clean") throw new AppError("not_found", "Not found.");
  return deps.storage.signedReadUrl(r.storage_key, 300);
}

/**
 * Cleanup: uploads stuck in pending/uploaded/scanning for over a day become
 * 'abandoned' and their objects are deleted. Quarantined objects are KEPT
 * (evidence) until a retention period is decided.
 */
export async function cleanupAbandoned(storage: StorageAdapter | null, now = new Date()) {
  const stale = await system((q) =>
    q.query<{ id: string; storage_key: string | null }>(
      `update app.media_uploads set status = 'abandoned', reason = 'abandoned', updated_at = now()
        where status in ('pending', 'uploaded', 'scanning') and created_at < $1::timestamptz - make_interval(hours => $2)
        returning id, storage_key`,
      [now, UPLOAD_LIMITS.abandonAfterHours],
    ),
  );
  for (const s of stale) if (storage && s.storage_key) await storage.delete(s.storage_key).catch(() => {});
  return stale.length;
}
