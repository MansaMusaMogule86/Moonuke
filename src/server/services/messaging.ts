import "server-only";
import { asViewer, system } from "@/server/db";
import { can, type Viewer } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import { scoreMessage, type RiskRule } from "@/server/messaging/risk";
import { formatMoney } from "@/server/payments";
import type { PortraitStudy } from "@/components/ui/Portrait";
import { formatCreatorPublicName } from "@/lib/creatorName";
import { audit } from "./audit";
import { hit, LIMITS } from "./rateLimit";

// =====================================================================
// Private messaging (Phase 7a): free text between a creator and their
// members. Permission is decided in the database (app.can_send_in); this
// layer adds validation, spam/risk rules, rate limits and idempotency.
// Messages are NOT end-to-end encrypted.
// =====================================================================

export const MESSAGE_MAX = 2000;
export const RESTRICTION = { rejectsPerHour: 5, autoHours: 1 } as const;

export type CanSend = "ok" | "not_found" | "unavailable" | "restricted" | "creator_restricted" | "creator_closed" | "members_only" | "unpublished" | "not_audience";
export const CAN_SEND_COPY: Record<Exclude<CanSend, "ok">, string> = {
  not_found: "This conversation isn't available.",
  unavailable: "This conversation isn't available right now.",
  restricted: "Messaging is paused on your account for a while. You can still read your conversations.",
  creator_restricted: "This creator has paused messages from you.",
  creator_closed: "This creator isn't taking messages right now.",
  members_only: "Messages are for current members. Join to continue the conversation.",
  unpublished: "Your profile must be live before you can message members.",
  not_audience: "You can only message your members and followers.",
};

function assertParticipantRole(v: Viewer) {
  if (!(v.role === "member" || v.role === "creator") || v.status !== "active") throw new AppError("forbidden", "Not allowed.");
}

export type ConversationSummary = {
  id: string;
  side: "fan" | "creator";
  peer: { id: string; name: string; handle: string | null; cover: PortraitStudy | null };
  lastMessageAt: string | null;
  preview: string | null;
  unread: boolean;
  muted: boolean;
  restricted: boolean;
  canSend: CanSend;
};

type ConvRow = {
  id: string; side: "fan" | "creator"; peer_id: string; peer_alias: string;
  handle: string | null; display_name: string | null; cover: PortraitStudy | null;
  last_message_at: Date | null; my_read: Date | null; muted: boolean; restricted: boolean; can_send: CanSend;
  preview: string | null; last_sender: string | null; last_price_cents: number | null; last_unlocked: boolean | null;
};

const CONV_SELECT = `
  select c.id, p.my_side as side, p.peer_id, p.peer_alias,
         cr.handle::text as handle, cr.display_name, cr.cover,
         c.last_message_at,
         case when p.my_side = 'fan' then c.fan_last_read_at else c.creator_last_read_at end as my_read,
         case when p.my_side = 'fan' then c.fan_muted else c.creator_muted end as muted,
         c.creator_restricted as restricted,
         app.can_send_in(c.id) as can_send,
         lm.preview as preview, lm.sender_id as last_sender, lm.price_cents as last_price_cents, lm.unlocked as last_unlocked
    from app.my_conversation_peers() p
    join app.conversations c on c.id = p.conversation_id
    left join app.creators cr on p.my_side = 'fan' and cr.user_id = p.peer_id
    left join lateral (select x.preview, x.sender_id, x.price_cents, x.unlocked from app.conversation_last_message(c.id) x) lm on true`;

const toSummary = (r: ConvRow, me: string): ConversationSummary => ({
  id: r.id,
  side: r.side,
  // A fan sees the creator's public name (if the profile is visible); a creator sees the fan's alias.
  peer: r.side === "fan"
    ? { id: r.peer_id, name: r.display_name ? formatCreatorPublicName(r.display_name) : "Creator unavailable", handle: r.handle, cover: r.cover }
    : { id: r.peer_id, name: r.peer_alias, handle: null, cover: null },
  lastMessageAt: r.last_message_at ? new Date(r.last_message_at).toISOString() : null,
  preview: r.preview
    ? (
        r.last_price_cents != null && !r.last_unlocked
          ? `🔒 ${r.preview}`
          : r.last_sender === me
            ? `You: ${r.preview}`
            : r.preview
      ).slice(0, 90)
    : null,
  unread: !!r.last_message_at && r.last_sender !== me && (!r.my_read || new Date(r.my_read) < new Date(r.last_message_at)),
  muted: r.muted,
  restricted: r.restricted,
  canSend: r.can_send,
});

export async function myConversations(viewer: Viewer): Promise<ConversationSummary[]> {
  assertParticipantRole(viewer);
  return asViewer(viewer, async (q) =>
    (await q.query<ConvRow>(`${CONV_SELECT} order by c.last_message_at desc nulls last, c.created_at desc limit 200`)).map((r) => toSummary(r, viewer.id)),
  );
}

export async function unreadMessagesCount(viewer: Viewer): Promise<number> {
  if (!(viewer.role === "member" || viewer.role === "creator") || viewer.status !== "active") return 0;
  const convs = await myConversations(viewer);
  return convs.filter((c) => c.unread).length;
}

export async function getConversation(viewer: Viewer, id: string): Promise<ConversationSummary | null> {
  assertParticipantRole(viewer);
  const r = await asViewer(viewer, (q) => q.one<ConvRow>(`${CONV_SELECT} where c.id = $1`, [id]));
  return r ? toSummary(r, viewer.id) : null;
}

export type ChatMessage = {
  id: string;
  mine: boolean;
  body: string | null;
  previewText: string | null;
  mediaKind: "text" | "image" | "set" | "video" | "audio" | null;
  priceCents: number | null;
  priceLabel: string | null;
  unlocked: boolean;
  status: "sent" | "held" | "removed";
  at: string;
};

/** Messages visible to this viewer (RLS + paid message masking). Optionally only those after a timestamp (for polling). */
export async function conversationMessages(viewer: Viewer, id: string, opts: { after?: string; markRead?: boolean } = {}): Promise<ChatMessage[]> {
  assertParticipantRole(viewer);
  const after = opts.after && !Number.isNaN(Date.parse(opts.after)) ? new Date(opts.after) : null;
  return asViewer(viewer, async (q) => {
    const ok = await q.one<{ ok: boolean }>(`select app.is_conversation_participant($1) as ok`, [id]);
    if (!ok?.ok) throw new AppError("not_found", "Conversation not found.");
    const rows = await q.query<{
      id: string;
      sender_id: string;
      body: string | null;
      preview_text: string | null;
      media_kind: ChatMessage["mediaKind"];
      price_cents: number | null;
      unlocked: boolean;
      status: ChatMessage["status"];
      created_at: Date;
    }>(
      `select id, sender_id, body, preview_text, media_kind, price_cents, unlocked, status, created_at
         from app.list_conversation_messages($1, $2)
        order by created_at asc`,
      [id, after],
    );
    if (opts.markRead !== false) await q.query(`select app.set_conversation_flags($1, null, null, true)`, [id]);
    if (opts.markRead !== false) {
      await q.query(`update app.notifications set read_at = now() where user_id = $1 and kind = 'message.received' and read_at is null and data->>'conversation' = $2`, [viewer.id, id]);
    }
    return rows.map((m) => ({
      id: m.id,
      mine: m.sender_id === viewer.id,
      body: m.unlocked ? m.body : null,
      previewText: m.preview_text,
      mediaKind: m.media_kind,
      priceCents: m.price_cents,
      priceLabel: m.price_cents != null ? formatMoney({ amountCents: m.price_cents, currency: "USD" }) : null,
      unlocked: m.unlocked,
      status: m.status,
      at: new Date(m.created_at).toISOString(),
    }));
  });
}

/** Open (or find) the conversation with another user. Returns null when messaging isn't allowed. */
export async function openConversation(viewer: Viewer, otherUserId: string): Promise<string> {
  assertParticipantRole(viewer);
  const r = await asViewer(viewer, (q) => q.one<{ id: string | null }>(`select app.open_conversation($1) as id`, [otherUserId]));
  if (!r?.id) throw new AppError("forbidden", "Messages are for current members of this creator.");
  return r.id;
}

export type SendResult = { id: string; status: "sent" | "held" };

export async function sendMessage(viewer: Viewer, conversationId: string, rawBody: string, clientKey: string): Promise<SendResult> {
  assertParticipantRole(viewer);
  const body = rawBody.replace(/\r\n/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g, "").trim();
  if (!body) throw new AppError("validation", "Write a message first.", "body");
  if (body.length > MESSAGE_MAX) throw new AppError("validation", `Keep messages under ${MESSAGE_MAX.toLocaleString("en")} characters.`, "body");
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(clientKey)) throw new AppError("validation", "Invalid request.");

  const pre = await asViewer(viewer, async (q) =>
    q.one<{ can_send: CanSend; same_here: number; same_anywhere: number; age_hours: number }>(
      `select app.can_send_in($1) as can_send,
              (select count(*)::int from app.messages where conversation_id = $1 and sender_id = $2 and body = $3 and created_at > now() - interval '60 seconds' and client_key is distinct from $4) as same_here,
              (select count(*)::int from app.messages where sender_id = $2 and body = $3 and created_at > now() - interval '10 minutes') as same_anywhere,
              (select extract(epoch from now() - created_at) / 3600 from app.users where id = $2)::float as age_hours`,
      [conversationId, viewer.id, body, clientKey],
    ),
  );
  if (!pre) throw new AppError("not_found", "Conversation not found.");
  if (pre.can_send !== "ok") throw new AppError(pre.can_send === "not_found" ? "not_found" : "forbidden", CAN_SEND_COPY[pre.can_send]);
  if (pre.same_here > 0) throw new AppError("conflict", "You just sent that.", "body");

  await hit(`msg:send:${viewer.id}`, LIMITS.messageSend);
  await hit(`msg:conv:${conversationId}:${viewer.id}`, LIMITS.messagePerConversation);

  const risk = scoreMessage(body, { recentSameBody: pre.same_anywhere, accountAgeHours: pre.age_hours });
  if (risk.action === "reject") {
    await noteRejection(viewer, risk.rules);
    throw new AppError("validation", risk.message ?? "That message can't be sent.", "body");
  }
  const status = risk.action === "hold" ? "held" : "sent";
  const id = await asViewer(viewer, async (q) => {
    try {
      const r = await q.one<{ id: string }>(`select app.send_message($1, $2, $3, $4, $5, $6) as id`, [conversationId, body, clientKey, status, risk.score, risk.rules]);
      return r!.id;
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (err.code === "42501") throw new AppError("forbidden", "You can't send messages here right now.");
      if (err.code === "23514") throw new AppError("validation", "Keep conversations here: links and contact details can't be shared.", "body");
      throw e;
    }
  });
  if (status === "held") {
    await system((q) => audit(q, { actorId: null, action: "message.auto_held", targetType: "message", targetId: id, metadata: { rules: risk.rules, score: risk.score } }));
  }
  return { id, status };
}

/**
 * Send a creator-authored locked paid message (`priceCents` in 100..100000).
 * The locked `body` is stored server-side and never returned to the fan until
 * `app.message_purchases` records a verified payment for `(fan_id, message_id)`.
 */
export async function sendPaidMessage(
  viewer: Viewer,
  conversationId: string,
  input: {
    body: string;
    previewText: string;
    priceCents: number;
    mediaKind?: "text" | "image" | "set" | "video" | "audio";
    clientKey: string;
  },
): Promise<SendResult> {
  if (viewer.role !== "creator" || viewer.status !== "active") {
    throw new AppError("forbidden", "Only creators can send locked paid messages.");
  }
  const body = input.body.replace(/\r\n/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g, "").trim();
  const previewText = input.previewText.replace(/\r\n/g, " ").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g, "").trim();
  if (!body) throw new AppError("validation", "Write the exclusive message content first.", "body");
  if (body.length > MESSAGE_MAX) throw new AppError("validation", `Keep messages under ${MESSAGE_MAX.toLocaleString("en")} characters.`, "body");
  if (!previewText || previewText.length > 280) {
    throw new AppError("validation", "Include a safe preview description (1–280 characters).", "previewText");
  }
  if (!Number.isInteger(input.priceCents) || input.priceCents < 100 || input.priceCents > 100000) {
    throw new AppError("validation", "Set a price between $1 and $1,000.", "priceCents");
  }
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(input.clientKey)) throw new AppError("validation", "Invalid request.");

  const bodyRisk = scoreMessage(body, { recentSameBody: 0, accountAgeHours: 1000 });
  if (bodyRisk.action === "reject") {
    throw new AppError("validation", bodyRisk.message ?? "That message can't be sent.", "body");
  }
  const previewRisk = scoreMessage(previewText, { recentSameBody: 0, accountAgeHours: 1000 });
  if (previewRisk.action === "reject") {
    throw new AppError("validation", previewRisk.message ?? "That preview can't be sent.", "previewText");
  }

  const status = bodyRisk.action === "hold" || previewRisk.action === "hold" ? "held" : "sent";
  const rules = [...new Set([...bodyRisk.rules, ...previewRisk.rules])];
  const score = Math.max(bodyRisk.score, previewRisk.score);

  const id = await asViewer(viewer, async (q) => {
    try {
      const r = await q.one<{ id: string }>(
        `select app.send_paid_message($1, $2, $3, $4, $5, $6, $7, $8, $9) as id`,
        [
          conversationId,
          body,
          previewText,
          input.priceCents,
          input.mediaKind ?? "text",
          input.clientKey,
          status,
          score,
          rules,
        ],
      );
      return r!.id;
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (err.code === "42501") throw new AppError("forbidden", "You can't send paid messages in this conversation right now.");
      if (err.code === "23514") throw new AppError("validation", "Keep conversations here: links and contact details can't be shared.", "body");
      throw e;
    }
  });
  return { id, status };
}

/** Repeated refused messages trigger a short automatic messaging pause (privileged write). */
async function noteRejection(viewer: Viewer, rules: RiskRule[]) {
  try {
    await hit(`msg:reject:${viewer.id}`, { limit: RESTRICTION.rejectsPerHour, windowSec: 3600 });
  } catch {
    await system(async (q) => {
      const active = await q.one(`select 1 from app.messaging_restrictions where user_id = $1 and lifted_at is null and until > now()`, [viewer.id]);
      if (active) return;
      await q.query(`insert into app.messaging_restrictions (user_id, until, reason) values ($1, now() + make_interval(hours => $2), $3)`, [
        viewer.id, RESTRICTION.autoHours, `Automatic: repeated messages refused (${[...new Set(rules)].join(", ")})`,
      ]);
      await audit(q, { actorId: null, action: "messaging.auto_restrict", targetType: "user", targetId: viewer.id, metadata: { hours: RESTRICTION.autoHours } });
    });
  }
}

export async function setConversationFlags(viewer: Viewer, id: string, flags: { muted?: boolean; restricted?: boolean }) {
  assertParticipantRole(viewer);
  await asViewer(viewer, async (q) => {
    const r = await q.one<{ ok: boolean }>(`select app.set_conversation_flags($1, $2, $3, false) as ok`, [id, flags.muted ?? null, flags.restricted ?? null]);
    if (!r?.ok) throw new AppError("not_found", "Conversation not found.");
    await audit(q, { actorId: viewer.id, action: "conversation.flags", targetType: "conversation", targetId: id, metadata: flags });
  });
}

/** A creator's current members, for starting a conversation. */
export async function myMembersToMessage(viewer: Viewer) {
  if (viewer.role !== "creator" || viewer.status !== "active") throw new AppError("forbidden", "Not allowed.");
  return asViewer(viewer, (q) => q.query<{ fan_id: string; alias: string; tier_kind: "member" | "vip"; since: Date }>(`select * from app.my_current_members() order by alias`));
}

// ---------------------------------------------------------------- creator settings

export type MessagingSettings = { membersCanMessage: boolean; requestsEnabled: false; requestPriceCents: number | null };

export async function mySettings(viewer: Viewer): Promise<MessagingSettings> {
  if (viewer.role !== "creator" || viewer.status !== "active") throw new AppError("forbidden", "Not allowed.");
  const r = await asViewer(viewer, (q) => q.one<{ members_can_message: boolean; request_price_cents: number | null }>(`select members_can_message, request_price_cents from app.messaging_settings where creator_id = $1`, [viewer.id]));
  return { membersCanMessage: r?.members_can_message ?? true, requestsEnabled: false, requestPriceCents: r?.request_price_cents ?? null };
}

export async function saveSettings(viewer: Viewer, input: { membersCanMessage: boolean }) {
  if (viewer.role !== "creator" || viewer.status !== "active") throw new AppError("forbidden", "Not allowed.");
  await asViewer(viewer, async (q) => {
    const profile = await q.one(`select 1 from app.creators where user_id = $1`, [viewer.id]);
    if (!profile) throw new AppError("validation", "Save your profile first.");
    await q.query(
      `insert into app.messaging_settings (creator_id, members_can_message) values ($1, $2)
       on conflict (creator_id) do update set members_can_message = excluded.members_can_message, updated_at = now()`,
      [viewer.id, input.membersCanMessage],
    );
    await audit(q, { actorId: viewer.id, action: "messaging.settings", targetType: "creator", targetId: viewer.id, metadata: input });
  });
}

// ---------------------------------------------------------------- house moderation

function assertOwner(v: Viewer) {
  if (!can(v, "moderation.review")) throw new AppError("forbidden", "Not allowed.");
}

export async function reportedMessageContext(owner: Viewer, reportId: string) {
  assertOwner(owner);
  return asViewer(owner, (q) =>
    q.query<{ id: string; sender_id: string; body: string; status: string; created_at: Date; is_reported: boolean }>(
      `select * from app.reported_message_context($1) order by created_at`,
      [reportId],
    ),
  );
}

export async function moderateMessage(owner: Viewer, reportId: string, messageId: string, status: "sent" | "held" | "removed") {
  assertOwner(owner);
  const r = await asViewer(owner, (q) => q.one<{ ok: boolean }>(`select app.moderate_message($1, $2, $3) as ok`, [messageId, status, reportId]));
  if (!r?.ok) throw new AppError("not_found", "Message not found.");
}

export async function heldMessages(owner: Viewer) {
  assertOwner(owner);
  return asViewer(owner, (q) =>
    q.query<{ id: string; conversation_id: string; sender_id: string; sender_alias: string; body: string; risk_score: number; risk_rules: string[]; created_at: Date }>(`select * from app.held_messages()`),
  );
}

export async function reviewHeld(owner: Viewer, messageId: string, release: boolean) {
  assertOwner(owner);
  const r = await asViewer(owner, (q) => q.one<{ ok: boolean }>(`select app.review_held_message($1, $2) as ok`, [messageId, release]));
  if (!r?.ok) throw new AppError("not_found", "That message is no longer held.");
}

export async function exceptionalAccessForReport(owner: Viewer, reportId: string, justification: string) {
  assertOwner(owner);
  const c = await asViewer(owner, (q) => q.one<{ id: string | null }>(`select app.report_conversation($1) as id`, [reportId]));
  if (!c?.id) throw new AppError("not_found", "Report not found.");
  return exceptionalAccess(owner, c.id, justification);
}

export async function exceptionalAccess(owner: Viewer, conversationId: string, justification: string) {
  assertOwner(owner);
  if (justification.trim().length < 40) throw new AppError("validation", "Write a justification of at least 40 characters. It is kept permanently in the audit log.", "justification");
  return asViewer(owner, (q) =>
    q.query<{ id: string; sender_id: string; body: string; status: string; created_at: Date }>(`select * from app.exceptional_conversation_access($1, $2) order by created_at`, [conversationId, justification]),
  );
}

export async function messagingRestrictions(owner: Viewer) {
  assertOwner(owner);
  return asViewer(owner, (q) =>
    q.query<{ id: string; user_id: string; alias: string; until: Date; reason: string; automatic: boolean; created_at: Date }>(
      `select r.id, r.user_id, u.alias::text as alias, r.until, r.reason, (r.created_by is null) as automatic, r.created_at
         from app.messaging_restrictions r join app.users u on u.id = r.user_id
        where r.lifted_at is null and r.until > now() order by r.until desc`,
    ),
  );
}

export async function restrictMessaging(owner: Viewer, userId: string, hours: number, reason: string) {
  assertOwner(owner);
  if (!Number.isInteger(hours) || hours < 1 || hours > 24 * 90) throw new AppError("validation", "Choose 1 hour to 90 days.", "hours");
  if (reason.trim().length < 3) throw new AppError("validation", "Add a reason.", "reason");
  if (userId === owner.id) throw new AppError("validation", "You can't pause your own account.");
  await asViewer(owner, async (q) => {
    await q.query(`insert into app.messaging_restrictions (user_id, until, reason, created_by) values ($1, now() + make_interval(hours => $2), $3, $4)`, [userId, hours, reason.trim().slice(0, 300), owner.id]);
    await audit(q, { actorId: owner.id, action: "messaging.restrict", targetType: "user", targetId: userId, metadata: { hours } });
  });
}

export async function liftRestriction(owner: Viewer, id: string) {
  assertOwner(owner);
  await asViewer(owner, async (q) => {
    const r = await q.one(`update app.messaging_restrictions set lifted_at = now(), lifted_by = $2 where id = $1 and lifted_at is null returning 1`, [id, owner.id]);
    if (!r) throw new AppError("not_found", "Restriction not found.");
    await audit(q, { actorId: owner.id, action: "messaging.lift", targetType: "restriction", targetId: id });
  });
}
