import "server-only";
import type { Q } from "@/server/db";

export type AuditEvent = {
  actorId: string | null;
  action: string; // "<area>.<verb>", e.g. "invitation.create"
  targetType?: string;
  targetId?: string;
  ipHash?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Append to the audit log inside the caller's transaction, so the event and
 * the change it describes commit (or roll back) together.
 * Never put secrets, tokens, passwords or raw IPs in metadata.
 */
export async function audit(q: Q, e: AuditEvent) {
  await q.query(
    `insert into app.audit_log (actor_id, action, target_type, target_id, ip_hash, metadata)
     values ($1, $2, $3, $4, $5, $6)`,
    [e.actorId, e.action, e.targetType ?? null, e.targetId ?? null, e.ipHash ?? null, JSON.stringify(e.metadata ?? {})],
  );
}
