import "server-only";
import { asViewer } from "@/server/db";
import { can, type Viewer } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import { BLAST } from "@/server/messaging/blasts";
import { scoreMessage } from "@/server/messaging/risk";
import { audit } from "./audit";

// =====================================================================
// Blasts (Phase 7b): a creator writes once; each eligible recipient gets an
// individual message in their own private conversation. Creators see counts,
// never the recipient list (except their own custom lists of members).
// =====================================================================

export const SEGMENTS = {
  members: "All current members",
  vip: "VIP members",
  followers: "Followers",
  expired: "Past members",
  new: "New members (last 30 days)",
  list: "A custom list",
} as const;
export type Segment = keyof typeof SEGMENTS;
export const BLAST_LIMITS = { perDay: 3, scheduleMaxDays: 30, body: 2000 } as const;

function assertCreator(v: Viewer) {
  if (v.role !== "creator" || v.status !== "active") throw new AppError("forbidden", "Not allowed.");
}

export async function segmentCounts(viewer: Viewer): Promise<Record<Exclude<Segment, "list">, number>> {
  assertCreator(viewer);
  const rows = await asViewer(viewer, (q) => q.query<{ segment: Exclude<Segment, "list">; n: number }>(`select * from app.my_blast_segment_counts()`));
  const out = { members: 0, vip: 0, followers: 0, expired: 0, new: 0 };
  for (const r of rows) out[r.segment] = r.n;
  return out;
}

export type BlastInput = { segment: Segment; listId?: string | null; body: string; scheduleAt?: Date | null };

export async function createBlast(viewer: Viewer, input: BlastInput, now = new Date()): Promise<{ id: string; scheduled: boolean }> {
  assertCreator(viewer);
  const body = (input.body ?? "").replace(/\r\n/g, "\n").trim();
  if (!body) throw new AppError("validation", "Write the message.", "body");
  if (body.length > BLAST_LIMITS.body) throw new AppError("validation", `Keep it under ${BLAST_LIMITS.body.toLocaleString("en")} characters.`, "body");
  if (!(input.segment in SEGMENTS)) throw new AppError("validation", "Choose who receives it.", "segment");
  if (input.segment === "list" && !input.listId) throw new AppError("validation", "Choose a list.", "listId");
  const at = input.scheduleAt ?? now;
  if (Number.isNaN(at.getTime())) throw new AppError("validation", "Choose a valid time.", "scheduleAt");
  if (input.scheduleAt && at.getTime() <= now.getTime() + 60_000) throw new AppError("validation", "Schedule at least a minute ahead, or send now.", "scheduleAt");
  if (at.getTime() > now.getTime() + BLAST_LIMITS.scheduleMaxDays * 86_400_000) throw new AppError("validation", `Schedule within ${BLAST_LIMITS.scheduleMaxDays} days.`, "scheduleAt");

  // Same content rules as direct messages; anything that would be held is refused outright for broadcasts.
  const risk = scoreMessage(body.replaceAll("{name}", "Member"), { recentSameBody: 0, accountAgeHours: 1000 });
  if (risk.action !== "send") throw new AppError("validation", risk.message ?? "That can't be broadcast. Remove anything that could read as a threat, scam or spam.", "body");

  return asViewer(viewer, async (q) => {
    const me = await q.one<{ published: boolean; paused: boolean }>(
      `select (c.published_at is not null) as published, app.messaging_restricted($1) as paused from app.creators c where c.user_id = $1`,
      [viewer.id],
    );
    if (!me?.published) throw new AppError("validation", "Your profile must be live before you can send Blasts.");
    if (me.paused) throw new AppError("forbidden", "Messaging is paused on your account for a while.");
    const recent = await q.one<{ n: number }>(`select count(*)::int as n from app.blasts where creator_id = $1 and status <> 'canceled' and created_at > now() - interval '24 hours'`, [viewer.id]);
    if ((recent?.n ?? 0) >= BLAST_LIMITS.perDay) throw new AppError("rate_limited", `You can send up to ${BLAST_LIMITS.perDay} Blasts a day.`);
    let size: number;
    if (input.segment === "list") {
      const l = await q.one<{ n: number }>(`select (select count(*)::int from app.blast_list_members where list_id = l.id) as n from app.blast_lists l where l.id = $1 and l.creator_id = $2`, [input.listId, viewer.id]);
      if (!l) throw new AppError("validation", "Choose one of your lists.", "listId");
      size = l.n;
    } else {
      const c = await q.one<{ n: number }>(`select n from app.my_blast_segment_counts() where segment = $1`, [input.segment]);
      size = c?.n ?? 0;
    }
    if (size === 0) throw new AppError("validation", "Nobody is in that audience yet.", "segment");
    if (size > BLAST.maxRecipients) throw new AppError("validation", `Blasts can reach up to ${BLAST.maxRecipients.toLocaleString("en")} people. Choose a smaller audience.`, "segment");
    const row = await q.one<{ id: string }>(
      `insert into app.blasts (creator_id, segment, list_id, body, scheduled_at) values ($1, $2, $3, $4, $5) returning id`,
      [viewer.id, input.segment, input.segment === "list" ? input.listId : null, body, at],
    );
    await audit(q, { actorId: viewer.id, action: "blast.create", targetType: "blast", targetId: row!.id, metadata: { segment: input.segment, audience: size, scheduled: !!input.scheduleAt } });
    return { id: row!.id, scheduled: !!input.scheduleAt };
  });
}

export type BlastRow = {
  id: string; segment: Segment; listName: string | null; body: string; scheduledAt: string; status: "scheduled" | "sending" | "sent" | "canceled";
  recipients: number; delivered: number; skipped: number; failed: number; read: number; replies: number;
};

export async function myBlasts(viewer: Viewer): Promise<BlastRow[]> {
  assertCreator(viewer);
  return asViewer(viewer, async (q) => {
    const rows = await q.query<{ id: string; segment: Segment; list_name: string | null; body: string; scheduled_at: Date; status: BlastRow["status"]; recipients: number; delivered: number; skipped: number; failed: number; read_count: number | null; reply_count: number | null }>(
      `select b.id, b.segment, l.name as list_name, b.body, b.scheduled_at, b.status, b.recipients, b.delivered, b.skipped, b.failed, e.read_count, e.reply_count
         from app.blasts b left join app.blast_lists l on l.id = b.list_id
         left join lateral app.my_blast_engagement(b.id) e on true
        where b.creator_id = $1 order by b.created_at desc limit 100`,
      [viewer.id],
    );
    return rows.map((r) => ({
      id: r.id, segment: r.segment, listName: r.list_name, body: r.body, scheduledAt: new Date(r.scheduled_at).toISOString(), status: r.status,
      recipients: r.recipients, delivered: r.delivered, skipped: r.skipped, failed: r.failed, read: r.read_count ?? 0, replies: r.reply_count ?? 0,
    }));
  });
}

export async function cancelBlast(viewer: Viewer, id: string) {
  assertCreator(viewer);
  await asViewer(viewer, async (q) => {
    const r = await q.one(`update app.blasts set status = 'canceled' where id = $1 and creator_id = $2 and status = 'scheduled' returning 1`, [id, viewer.id]);
    if (!r) throw new AppError("conflict", "Only a scheduled Blast that hasn't started can be cancelled.");
    await audit(q, { actorId: viewer.id, action: "blast.cancel", targetType: "blast", targetId: id });
  });
}

// ---------------------------------------------------------------- templates

export type Template = { id: string; name: string; body: string };
export async function myTemplates(viewer: Viewer): Promise<Template[]> {
  assertCreator(viewer);
  return asViewer(viewer, (q) => q.query<Template>(`select id, name, body from app.blast_templates where creator_id = $1 order by name`, [viewer.id]));
}
export async function saveTemplate(viewer: Viewer, name: string, body: string) {
  assertCreator(viewer);
  const n = name.trim().slice(0, 60);
  const b = body.trim();
  if (!n) throw new AppError("validation", "Name the template.", "templateName");
  if (!b || b.length > BLAST_LIMITS.body) throw new AppError("validation", "Write the message first.", "body");
  if (scoreMessage(b.replaceAll("{name}", "Member"), { recentSameBody: 0, accountAgeHours: 1000 }).action !== "send") throw new AppError("validation", "That copy can't be used in Blasts.", "body");
  await asViewer(viewer, async (q) => {
    const c = await q.one<{ n: number }>(`select count(*)::int as n from app.blast_templates where creator_id = $1`, [viewer.id]);
    if ((c?.n ?? 0) >= 20) throw new AppError("conflict", "You can keep up to 20 templates.");
    await q
      .query(`insert into app.blast_templates (creator_id, name, body) values ($1, $2, $3) on conflict (creator_id, name) do update set body = excluded.body`, [viewer.id, n, b])
      .catch((e) => {
        throw e;
      });
  });
}
export async function deleteTemplate(viewer: Viewer, id: string) {
  assertCreator(viewer);
  await asViewer(viewer, (q) => q.query(`delete from app.blast_templates where id = $1 and creator_id = $2`, [id, viewer.id]));
}

// ---------------------------------------------------------------- custom lists (members only)

export type BlastList = { id: string; name: string; members: { fanId: string; alias: string }[] };
export async function myLists(viewer: Viewer): Promise<BlastList[]> {
  assertCreator(viewer);
  return asViewer(viewer, async (q) => {
    const lists = await q.query<{ id: string; name: string }>(`select id, name from app.blast_lists where creator_id = $1 order by name`, [viewer.id]);
    const dir = new Map((await q.query<{ fan_id: string; alias: string }>(`select fan_id, alias from app.my_member_directory()`)).map((d) => [d.fan_id, d.alias]));
    const out: BlastList[] = [];
    for (const l of lists) {
      const m = await q.query<{ fan_id: string }>(`select fan_id from app.blast_list_members where list_id = $1`, [l.id]);
      out.push({ id: l.id, name: l.name, members: m.filter((x) => dir.has(x.fan_id)).map((x) => ({ fanId: x.fan_id, alias: dir.get(x.fan_id)! })).sort((a, b) => a.alias.localeCompare(b.alias)) });
    }
    return out;
  });
}
export async function memberDirectory(viewer: Viewer) {
  assertCreator(viewer);
  return asViewer(viewer, (q) => q.query<{ fan_id: string; alias: string; current: boolean }>(`select * from app.my_member_directory() order by alias`));
}
export async function createList(viewer: Viewer, name: string) {
  assertCreator(viewer);
  const n = name.trim().slice(0, 60);
  if (!n) throw new AppError("validation", "Name the list.", "name");
  return asViewer(viewer, async (q) => {
    const c = await q.one<{ n: number }>(`select count(*)::int as n from app.blast_lists where creator_id = $1`, [viewer.id]);
    if ((c?.n ?? 0) >= 20) throw new AppError("conflict", "You can keep up to 20 lists.");
    try {
      return (await q.one<{ id: string }>(`insert into app.blast_lists (creator_id, name) values ($1, $2) returning id`, [viewer.id, n]))!.id;
    } catch (e) {
      if ((e as { code?: string }).code === "23505") throw new AppError("conflict", "You already have a list with that name.", "name");
      throw e;
    }
  });
}
export async function setListMember(viewer: Viewer, listId: string, fanId: string, add: boolean) {
  assertCreator(viewer);
  await asViewer(viewer, async (q) => {
    if (add) {
      try {
        await q.query(`insert into app.blast_list_members (list_id, fan_id) values ($1, $2) on conflict do nothing`, [listId, fanId]);
      } catch (e) {
        if ((e as { code?: string }).code === "42501") throw new AppError("validation", "Only your current or past members can be added.");
        throw e;
      }
    } else {
      await q.query(`delete from app.blast_list_members where list_id = $1 and fan_id = $2`, [listId, fanId]);
    }
  });
}
export async function deleteList(viewer: Viewer, listId: string) {
  assertCreator(viewer);
  await asViewer(viewer, async (q) => {
    await q.query(`update app.blasts set status = 'canceled' where list_id = $1 and creator_id = $2 and status = 'scheduled'`, [listId, viewer.id]);
    await q.query(`delete from app.blast_lists where id = $1 and creator_id = $2`, [listId, viewer.id]);
  });
}

// ---------------------------------------------------------------- fan opt-out

export async function setBlastOptOut(viewer: Viewer, creatorId: string, optOut: boolean) {
  if (!(viewer.role === "member" || viewer.role === "creator") || viewer.status !== "active") throw new AppError("forbidden", "Not allowed.");
  await asViewer(viewer, async (q) => {
    if (optOut) await q.query(`insert into app.blast_opt_outs (fan_id, creator_id) values ($1, $2) on conflict do nothing`, [viewer.id, creatorId]);
    else await q.query(`delete from app.blast_opt_outs where fan_id = $1 and creator_id = $2`, [viewer.id, creatorId]);
    await audit(q, { actorId: viewer.id, action: optOut ? "blast.opt_out" : "blast.opt_in", targetType: "creator", targetId: creatorId });
  });
}
export async function isOptedOut(viewer: Viewer, creatorId: string) {
  const r = await asViewer(viewer, (q) => q.one(`select 1 from app.blast_opt_outs where fan_id = $1 and creator_id = $2`, [viewer.id, creatorId]));
  return !!r;
}

// ---------------------------------------------------------------- 7c: appeals of messaging pauses

export async function myMessagingPause(viewer: Viewer) {
  return asViewer(viewer, (q) =>
    q.one<{ id: string; until: Date; reason: string; appeal_status: string | null; decision_note: string | null }>(
      `select r.id, r.until, r.reason, a.status as appeal_status, a.decision_note
         from app.messaging_restrictions r left join app.messaging_appeals a on a.restriction_id = r.id
        where r.user_id = $1 and r.lifted_at is null and r.until > now() order by r.until desc limit 1`,
      [viewer.id],
    ),
  );
}

export async function fileAppeal(viewer: Viewer, restrictionId: string, body: string) {
  const text = body.trim();
  if (text.length < 10 || text.length > 1000) throw new AppError("validation", "Explain in 10 to 1,000 characters.", "appeal");
  await asViewer(viewer, async (q) => {
    try {
      await q.query(`insert into app.messaging_appeals (restriction_id, user_id, body) values ($1, $2, $3)`, [restrictionId, viewer.id, text]);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "23505") throw new AppError("conflict", "You've already appealed this pause.");
      if (code === "42501") throw new AppError("not_found", "That pause isn't active.");
      throw e;
    }
    await audit(q, { actorId: viewer.id, action: "appeal.file", targetType: "restriction", targetId: restrictionId });
  });
}

export async function openAppeals(owner: Viewer) {
  if (!can(owner, "moderation.review")) throw new AppError("forbidden", "Not allowed.");
  return asViewer(owner, (q) =>
    q.query<{ id: string; restriction_id: string; alias: string; body: string; reason: string; until: Date; automatic: boolean; created_at: Date }>(
      `select a.id, a.restriction_id, u.alias::text as alias, a.body, r.reason, r.until, (r.created_by is null) as automatic, a.created_at
         from app.messaging_appeals a join app.messaging_restrictions r on r.id = a.restriction_id join app.users u on u.id = a.user_id
        where a.status = 'open' order by a.created_at asc`,
    ),
  );
}

export async function decideAppeal(owner: Viewer, appealId: string, overturn: boolean, note: string) {
  if (!can(owner, "moderation.review")) throw new AppError("forbidden", "Not allowed.");
  await asViewer(owner, async (q) => {
    const a = await q.one<{ restriction_id: string }>(
      `update app.messaging_appeals set status = $2, decision_note = nullif($3, ''), decided_by = $4, decided_at = now()
        where id = $1 and status = 'open' returning restriction_id`,
      [appealId, overturn ? "overturned" : "upheld", note.trim().slice(0, 500), owner.id],
    );
    if (!a) throw new AppError("not_found", "Appeal not found.");
    if (overturn) await q.query(`update app.messaging_restrictions set lifted_at = now(), lifted_by = $2 where id = $1 and lifted_at is null`, [a.restriction_id, owner.id]);
    await audit(q, { actorId: owner.id, action: overturn ? "appeal.overturn" : "appeal.uphold", targetType: "appeal", targetId: appealId });
  });
}
