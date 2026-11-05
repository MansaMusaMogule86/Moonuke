import "server-only";
import { asViewer, system } from "@/server/db";
import type { Viewer } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import type { PortraitStudy } from "@/components/ui/Portrait";

// =====================================================================
// Notification centre. Rows are references only; what's displayed is
// re-read under RLS, so a notification never reveals more than its reader
// may see (notifications about hidden/deleted/blocked posts disappear).
// =====================================================================

export type NotificationKind = "post.published" | "proposal.received" | "message.received" | "blast.received" | "system";
export type FanNotification = {
  id: string;
  kind: NotificationKind;
  at: string;
  read: boolean;
  title: string;
  detail: string | null;
  href: string | null;
  creator: { handle: string; displayName: string; cover: PortraitStudy } | null;
};

function assertMember(v: Viewer) {
  if (v.status !== "active") throw new AppError("forbidden", "Not allowed.");
}

type Row = {
  id: string; kind: NotificationKind; available_at: Date; read_at: Date | null; data: Record<string, unknown>;
  post_id: string | null; teaser: string | null; access: string | null;
  handle: string | null; display_name: string | null; cover: PortraitStudy | null;
};

const ACCESS_LABEL: Record<string, string> = { preview: "Open to all", members: "Members", vip: "VIP", ppv: "Pay per view" };

function present(r: Row): FanNotification {
  const creator = r.handle ? { handle: r.handle, displayName: r.display_name!, cover: r.cover! } : null;
  const base = { id: r.id, kind: r.kind, at: new Date(r.available_at).toISOString(), read: !!r.read_at, creator };
  switch (r.kind) {
    case "post.published":
      return { ...base, title: `${creator?.displayName ?? "A creator"} posted`, detail: r.teaser ? `${r.teaser} · ${ACCESS_LABEL[r.access ?? ""] ?? ""}` : null, href: creator ? `/c/${creator.handle}#post-${r.post_id}` : null };
    case "message.received":
      return {
        ...base,
        title: `New message from ${typeof r.data.from === "string" ? r.data.from : "a member"}`,
        detail: "Open the conversation to read it.",
        href: typeof r.data.conversation === "string" ? `/messages/${r.data.conversation}` : "/messages",
      };
    case "proposal.received":
      return { ...base, title: r.data.source === "import" ? "Imported details are ready to review" : "The house prepared a profile draft for you", detail: "Nothing changes until you accept it.", href: "/studio" };
    default:
      // Future kinds (messages, Blasts) render generically until their UI exists.
      return { ...base, title: typeof r.data.title === "string" ? r.data.title.slice(0, 120) : "Notification", detail: null, href: null };
  }
}

const SELECT = `select n.id, n.kind, n.available_at, n.read_at, n.data, n.post_id, p.teaser, p.access::text as access,
                       c.handle::text as handle, c.display_name, c.cover
                  from app.notifications n
                  left join app.posts p on p.id = n.post_id
                  left join app.creators c on c.user_id = n.creator_id`;

export async function myNotifications(viewer: Viewer, opts: { unreadOnly?: boolean; limit?: number } = {}): Promise<FanNotification[]> {
  assertMember(viewer);
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  return asViewer(viewer, async (q) =>
    (
      await q.query<Row>(`${SELECT} where n.user_id = $1 and ($2::boolean is false or n.read_at is null) order by n.available_at desc limit $3`, [
        viewer.id, !!opts.unreadOnly, limit,
      ])
    ).map(present),
  );
}

export async function unreadCount(viewer: Viewer): Promise<number> {
  if (viewer.status !== "active") return 0;
  const r = await asViewer(viewer, (q) => q.one<{ n: number }>(`select count(*)::int as n from app.notifications where user_id = $1 and read_at is null`, [viewer.id]));
  return r?.n ?? 0;
}

export async function markRead(viewer: Viewer, id: string): Promise<void> {
  assertMember(viewer);
  const r = await asViewer(viewer, (q) => q.one(`update app.notifications set read_at = coalesce(read_at, now()) where id = $1 and user_id = $2 returning 1`, [id, viewer.id]));
  if (!r) throw new AppError("not_found", "Notification not found.");
}

export async function markAllRead(viewer: Viewer): Promise<number> {
  assertMember(viewer);
  return asViewer(viewer, async (q) => (await q.query(`update app.notifications set read_at = now() where user_id = $1 and read_at is null returning 1`, [viewer.id])).length);
}

/**
 * Privileged entry point for future senders (Messaging, Blasts). Not used by
 * any user action yet. Callers must have authorised the send themselves; the
 * payload is size-capped by the table and must never carry message bodies.
 */
export async function deliverNotification(input: { userId: string; kind: Exclude<NotificationKind, "post.published" | "proposal.received">; creatorId?: string; data?: Record<string, string> }) {
  return system((q) =>
    q.one<{ id: string }>(`insert into app.notifications (user_id, kind, creator_id, data) values ($1, $2, $3, $4) returning id`, [
      input.userId, input.kind, input.creatorId ?? null, JSON.stringify(input.data ?? {}),
    ]),
  );
}
