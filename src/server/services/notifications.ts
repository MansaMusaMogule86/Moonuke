import "server-only";
import { asViewer, system } from "@/server/db";
import type { Viewer } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import type { PortraitStudy } from "@/components/ui/Portrait";
import { formatCreatorPublicName } from "@/lib/creatorName";

// =====================================================================
// Notification centre. Rows are references only; what's displayed is
// re-read under RLS, so a notification never reveals more than its reader
// may see (notifications about hidden/deleted/blocked posts disappear).
// =====================================================================

export type NotificationKind =
  | "post.published"
  | "proposal.received"
  | "message.received"
  | "blast.received"
  | "system"
  | "tip.received"
  | "subscription.started"
  | "subscription.renewed"
  | "payment.succeeded"
  | "payment.refunded"
  | "referral.commission"
  | "payout.available"
  | "payout.requested"
  | "payout.paid"
  | "payout.failed"
  | "content.published"
  | "blast.sent"
  | "security.alert";
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
  const creator = r.handle ? { handle: r.handle, displayName: formatCreatorPublicName(r.display_name), cover: r.cover! } : null;
  const base = { id: r.id, kind: r.kind, at: new Date(r.available_at).toISOString(), read: !!r.read_at, creator };
  switch (r.kind) {
    case "post.published":
      return { ...base, title: `${creator?.displayName ?? "A creator"} posted`, detail: r.teaser ? `${r.teaser} · ${ACCESS_LABEL[r.access ?? ""] ?? ""}` : null, href: creator ? `/c/${creator.handle}#post-${r.post_id}` : null };
    case "message.received": {
      const fromSender =
        r.data.sender_is_creator === true && creator
          ? creator.displayName
          : typeof r.data.from === "string"
            ? r.data.from
            : "a member";
      return {
        ...base,
        title: `New message from ${fromSender}`,
        detail: "Open the conversation to read it.",
        href: typeof r.data.conversation === "string" ? `/messages/${r.data.conversation}` : "/messages",
      };
    }
    case "proposal.received":
      return { ...base, title: r.data.source === "import" ? "Imported details are ready to review" : "The house prepared a profile draft for you", detail: "Nothing changes until you accept it.", href: "/studio" };
    case "system":
      return {
        ...base,
        title: typeof r.data.title === "string" ? r.data.title.slice(0, 120) : "Notification",
        detail: null,
        // Internal paths only.
        href: typeof r.data.href === "string" && /^\/[a-z/-]*$/.test(r.data.href) ? r.data.href : null,
      };
    case "tip.received":
      return { ...base, title: "New tip received", detail: "See Studio earnings for the ledger amount.", href: "/studio/earnings" };
    case "subscription.started":
      return { ...base, title: "New subscriber", detail: "A fan joined your membership.", href: "/studio/members" };
    case "subscription.renewed":
      return { ...base, title: "Subscription renewed", detail: "See My Access for the current period.", href: "/library?tab=subscriptions" };
    case "payment.succeeded":
      return { ...base, title: "Payment confirmed", detail: "Your receipt is in My Access.", href: "/library?tab=history" };
    case "payment.refunded":
      return { ...base, title: "Refund processed", detail: "See My Access for the updated receipt.", href: "/library?tab=history" };
    case "referral.commission":
      return { ...base, title: "Referral commission earned", detail: "See Studio referrals for the ledger entry.", href: "/studio/referrals" };
    case "payout.available":
      return { ...base, title: "Funds available", detail: "Matured funds are ready in Studio earnings.", href: "/studio/earnings" };
    case "payout.requested":
      return { ...base, title: "Withdrawal requested", detail: "Track status in Studio earnings.", href: "/studio/earnings" };
    case "payout.paid":
      return { ...base, title: "Withdrawal paid", detail: "Check your bank statement for the payout sender entry.", href: "/studio/earnings" };
    case "payout.failed":
      return { ...base, title: "Withdrawal failed", detail: "Review the destination in Studio earnings.", href: "/studio/earnings" };
    case "content.published":
      return { ...base, title: `${creator?.displayName ?? "A creator"} published`, detail: null, href: creator ? `/c/${creator.handle}` : null };
    case "blast.sent":
      return { ...base, title: "Blast sent", detail: "See blast history for delivered counts.", href: "/studio/blasts" };
    case "security.alert":
      return {
        ...base,
        title: typeof r.data.title === "string" ? r.data.title.slice(0, 120) : "Security update",
        detail: null,
        href: typeof r.data.href === "string" && /^\/[a-z/-]*$/.test(r.data.href) ? r.data.href : "/account/security",
      };
    default:
      return { ...base, title: typeof r.data.title === "string" ? r.data.title.slice(0, 120) : "Notification", detail: null, href: null };
  }
}

const SELECT = `select n.id, n.kind, n.available_at, n.read_at, n.data, n.post_id, p.teaser, p.access::text as access,
                       c.handle::text as handle, c.display_name, c.cover
                  from app.notifications n
                  left join app.posts p on p.id = n.post_id
                  left join app.creators c on c.user_id = n.creator_id`;

export async function myNotifications(
  viewer: Viewer,
  opts: { unreadOnly?: boolean; kind?: NotificationKind; limit?: number; offset?: number } = {},
): Promise<FanNotification[]> {
  assertMember(viewer);
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const offset = Math.min(Math.max(opts.offset ?? 0, 0), 10000);
  return asViewer(viewer, async (q) =>
    (
      await q.query<Row>(
        `${SELECT} where n.user_id = $1 and ($2::boolean is false or n.read_at is null) and ($3::text is null or n.kind = $3) order by n.available_at desc limit $4 offset $5`,
        [viewer.id, !!opts.unreadOnly, opts.kind ?? null, limit, offset],
      )
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

const PREF_COLUMN: Partial<Record<NotificationKind, string>> = {
  "post.published": "notify_new_posts",
  "content.published": "notify_new_posts",
  "message.received": "notify_messages",
  "blast.received": "notify_messages",
  "blast.sent": "notify_messages",
  "payment.succeeded": "notify_billing",
  "payment.refunded": "notify_billing",
  "subscription.started": "notify_subscriptions",
  "subscription.renewed": "notify_subscriptions",
  "tip.received": "notify_tips",
  "referral.commission": "notify_referrals",
  "payout.available": "notify_payouts",
  "payout.requested": "notify_payouts",
  "payout.paid": "notify_payouts",
  "payout.failed": "notify_payouts",
};

/**
 * Privileged entry point for senders (tips, subs, payments, referrals,
 * payouts, blasts, security). Callers must have authorised the send; the
 * payload is size-capped and must never carry message bodies or amounts.
 * Financial notifications link to ledger-backed pages instead of stating sums.
 * Delivery is idempotent per idempotencyKey and respects user preferences
 * (security/system/proposal kinds always deliver).
 */
export async function deliverNotification(input: {
  userId: string;
  kind: NotificationKind;
  creatorId?: string;
  postId?: string;
  data?: Record<string, string>;
  idempotencyKey?: string;
}) {
  return system(async (q) => {
    const col = PREF_COLUMN[input.kind];
    if (col) {
      const pref = await q.one<Record<string, boolean>>(
        `select ${col} as on from app.user_preferences where user_id = $1`,
        [input.userId],
      );
      if (pref && pref.on === false) return null;
    }
    if (input.idempotencyKey) {
      const existing = await q.one<{ id: string }>(
        `select id from app.notifications where user_id = $1 and kind = $2 and idempotency_key = $3`,
        [input.userId, input.kind, input.idempotencyKey],
      );
      if (existing) return existing;
    }
    return q.one<{ id: string }>(
      `insert into app.notifications (user_id, kind, creator_id, post_id, data, idempotency_key) values ($1, $2, $3, $4, $5, $6) returning id`,
      [input.userId, input.kind, input.creatorId ?? null, input.postId ?? null, JSON.stringify(input.data ?? {}), input.idempotencyKey ?? null],
    );
  });
}
