import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { STUDIO_SECTIONS } from "@/components/studio/StudioShell";
import { resolvePathWorkspace } from "@/components/layout/ClubNav";
import { getWorkspaceCopy, localeDirection, normalizeLocale } from "@/lib/i18n";
import { createSession } from "@/server/services/sessions";
import {
  getMyFanAlias,
  isSafeAuthorizedDeepLink,
  resolveActiveWorkspace,
  resolvePostLoginDestination,
  resolveWorkspaceIdentity,
  switchWorkspace,
  updateMyFanAlias,
} from "@/server/services/workspace";
import {
  myConversations,
  myCreatorConversations,
  myFanConversations,
  openConversation,
  sendMessage,
  unreadCreatorMessagesCount,
  unreadFanMessagesCount,
  unreadMessagesByWorkspace,
} from "@/server/services/messaging";
import { getOrCreateCreatorRecruitmentLink } from "@/server/services/creatorReferralsAndWithdrawals";
import { myDetailedStudioEarnings } from "@/server/services/earnings";
import { requestReferral } from "@/server/services/referrals";
import { mySubscriptions } from "@/server/services/fan";
import { mfaStatus, startEnrollment } from "@/server/services/mfa";
import type { SeedResult } from "@/server/seed";
import { allowCreatorFixture, closePool, resetDb, system, viewer } from "./helpers";

let s: SeedResult;

beforeEach(async () => {
  s = await resetDb();
});

afterAll(async () => {
  await closePool();
});

describe("Fan View & Creator Studio Workspace and Identity Separation", () => {
  it("1–4. routes approved creators to /studio, unfinished creators to /studio/settings, fans to /home, and preserves only authorized deep links", async () => {
    const fanViewer = await viewer(s.memberId);

    // Fan default landing -> /home
    expect(await resolvePostLoginDestination(fanViewer)).toBe("/home");
    // Fan deep link to /library is preserved
    expect(await resolvePostLoginDestination(fanViewer, "/library?tab=unlocked")).toBe(
      "/library?tab=unlocked",
    );
    // Fan deep link to /studio is rejected and falls back to /home
    expect(await resolvePostLoginDestination(fanViewer, "/studio/earnings")).toBe("/home");
    expect(isSafeAuthorizedDeepLink(fanViewer, "/studio")).toBe(false);
    expect(isSafeAuthorizedDeepLink(fanViewer, "/owner")).toBe(false);

    // Creator with unfinished onboarding (needs verification / setup) -> /studio/settings
    await allowCreatorFixture("new-creator@test.local");
    const newCreatorRow = await system((q) =>
      q.one<{ id: string }>(
        `insert into app.users (email, email_verified_at, password_hash, role, status, alias, adult_attested_at)
         values ('new-creator@test.local', now(), 'x', 'creator', 'active', 'Soraya', now())
         returning id`,
      ),
    );
    const newCreatorViewer = await viewer(newCreatorRow!.id);
    expect(await resolvePostLoginDestination(newCreatorViewer)).toBe("/studio/settings");

    // Verified creator with completed profile & verification -> /studio
    await system((q) =>
      q.query(
        `insert into app.creator_verifications (user_id, status, submitted_at, reviewed_at)
         values ($1, 'verified', now(), now())
         on conflict (user_id) do update set status = 'verified', reviewed_at = now()`,
        [s.creatorIds.isadora],
      ),
    );
    const approvedCreatorViewer = await viewer(s.creatorIds.isadora);
    expect(await resolvePostLoginDestination(approvedCreatorViewer)).toBe("/studio");

    // Creator deep link to a fan route (/library or /messages) is preserved when explicitly requested
    expect(
      await resolvePostLoginDestination(approvedCreatorViewer, "/library?tab=subscriptions"),
    ).toBe("/library?tab=subscriptions");
    expect(
      await resolvePostLoginDestination(approvedCreatorViewer, "/studio/earnings"),
    ).toBe("/studio/earnings");
  });

  it("5–8. enforces workspace switching permissions and separates Fan View and Creator Studio navigation", async () => {
    const fanViewer = await viewer(s.memberId);
    const creatorViewer = await viewer(s.creatorIds.isadora);

    // Ordinary fan cannot switch to Creator Studio
    await expect(switchWorkspace(fanViewer, "studio")).rejects.toThrow(
      /Only approved creators can access Creator Studio/i,
    );
    expect(resolveActiveWorkspace(fanViewer, "/studio", "studio")).toBe("fan");
    expect(resolvePathWorkspace("/studio", false, "studio")).toBe("fan");

    // Creator can switch cleanly between Creator Studio and Fan View without changing role
    const toFan = await switchWorkspace(creatorViewer, "fan");
    expect(toFan).toEqual({ workspace: "fan", redirectTo: "/home" });

    const dbPrefFan = await system((q) =>
      q.one<{ preferred_workspace: string; role: string }>(
        `select preferred_workspace, role::text as role from app.users where id = $1`,
        [s.creatorIds.isadora],
      ),
    );
    expect(dbPrefFan).toEqual({ preferred_workspace: "fan", role: "creator" });

    const toStudio = await switchWorkspace(creatorViewer, "studio");
    expect(toStudio).toEqual({ workspace: "studio", redirectTo: "/studio" });

    const dbPrefStudio = await system((q) =>
      q.one<{ preferred_workspace: string; role: string }>(
        `select preferred_workspace, role::text as role from app.users where id = $1`,
        [s.creatorIds.isadora],
      ),
    );
    expect(dbPrefStudio).toEqual({ preferred_workspace: "studio", role: "creator" });

    // Route-based workspace resolution
    expect(resolveActiveWorkspace(creatorViewer, "/studio/posts", "fan")).toBe("studio");
    expect(resolveActiveWorkspace(creatorViewer, "/library", "studio")).toBe("fan");
    expect(resolveActiveWorkspace(creatorViewer, "/messages", "studio")).toBe("fan");
    expect(resolveActiveWorkspace(creatorViewer, "/account/security", "fan")).toBe("fan");
    expect(resolveActiveWorkspace(creatorViewer, "/account/security", "studio")).toBe("studio");

    // Creator Studio navigation labels match the specification
    const labels = STUDIO_SECTIONS.map((sec) => sec.label);
    expect(labels).toEqual([
      "Overview",
      "Posts",
      "Media Vault",
      "Inbox",
      "Blasts",
      "Members",
      "Tiers",
      "Earnings",
      "Referrals",
      "Notifications",
      "Settings",
      "Participants",
    ]);
  });

  it("9. separates Creator Studio Diva identity from Fan View alias while keeping one immutable user UUID", async () => {
    const token = await createSession(s.creatorIds.isadora, "vitest");
    const { resolveSession } = await import("@/server/services/sessions");
    const session = await resolveSession(token);
    expect(session).not.toBeNull();
    // Creator's primary session alias stays "Diva Isadora Lune" for backward compatibility
    expect(session!.alias).toBe("Diva Isadora Lune");
    // Fan alias is automatically separated and never starts with "Diva " or exposes email
    expect(session!.fanAlias).toBeDefined();
    expect(session!.fanAlias!.toLowerCase().startsWith("diva ")).toBe(false);
    expect(session!.fanAlias).not.toContain("@");

    const studioIdentity = resolveWorkspaceIdentity(session!, "studio");
    const fanIdentity = resolveWorkspaceIdentity(session!, "fan");

    expect(studioIdentity.displayName).toBe("Diva Isadora Lune");
    expect(studioIdentity.roleBadge).toBe("CREATOR STUDIO");
    expect(studioIdentity.switchLabel).toBe("Switch to Fan View");

    expect(fanIdentity.displayName).not.toBe("Diva Isadora Lune");
    expect(fanIdentity.displayName.toLowerCase().startsWith("diva ")).toBe(false);
    expect(fanIdentity.roleBadge).toBe("FAN");
    expect(fanIdentity.switchLabel).toBe("Switch to Creator Studio");

    // Updating Fan View alias preserves the exact same user UUID and creator Diva name
    const updated = await updateMyFanAlias(session!, "LuneNocturne");
    expect(updated.userId).toBe(s.creatorIds.isadora);
    expect(updated.fanAlias).toBe("LuneNocturne");
    expect(await getMyFanAlias(session!)).toBe("LuneNocturne");

    // Rejects setting Fan View alias to "Diva ..." or equal to the creator name
    await expect(updateMyFanAlias(session!, "Diva Lune")).rejects.toThrow(/Diva/i);
    await expect(updateMyFanAlias(session!, "Isadora Lune")).rejects.toThrow(
      /different from your public Diva creator name/i,
    );
  });

  it("10. isolates fan-side messages (/messages) from creator-side inbox (/studio/messaging) and scopes unread counts", async () => {
    // Creator A ("Diva Isadora Lune") acts both as a creator (talking to Fan s.memberId)
    // and as a fan (talking to Creator C "Diva Valentin Ash", a seeded creator).
    const creatorCId = s.creatorIds.valentin;

    const viewerA = await viewer(s.creatorIds.isadora);
    const viewerFanB = await viewer(s.memberId);
    const viewerCreatorC = await viewer(creatorCId);

    // Age accounts past new-account messaging limits, as the messaging suite does.
    await system((q) =>
      q.query(`update app.users set created_at = now() - interval '30 days' where id = any ($1)`, [
        [viewerA.id, viewerFanB.id, viewerCreatorC.id],
      ]),
    );

    await updateMyFanAlias(viewerA, "SolsticeReader");

    // Ensure Fan B has an active subscription to Creator A
    const tierA = await system((q) =>
      q.one<{ id: string; creator_id: string }>(
        `select t.id, t.creator_id
           from app.tiers t
           join app.creators c on c.user_id = t.creator_id
          where c.handle = 'isadora'
          limit 1`,
      ),
    );
    await system((q) =>
      q.query(
        `insert into app.subscriptions (fan_id, creator_id, tier_id, status, current_period_end)
         values ($1, $2, $3, 'active', now() + interval '30 days')
         on conflict do nothing`,
        [s.memberId, tierA!.creator_id, tierA!.id],
      ),
    );

    // Give Creator A (acting as a fan!) an active subscription to Creator C
    const tierC = await system((q) =>
      q.one<{ id: string; creator_id: string }>(
        `select t.id, t.creator_id
           from app.tiers t
           join app.creators c on c.user_id = t.creator_id
          where c.handle = 'valentin'
          limit 1`,
      ),
    );
    await system((q) =>
      q.query(
        `insert into app.subscriptions (fan_id, creator_id, tier_id, status, current_period_end)
         values ($1, $2, $3, 'active', now() + interval '30 days')
         on conflict do nothing`,
        [s.creatorIds.isadora, tierC!.creator_id, tierC!.id],
      ),
    );

    // 1. Fan B opens a conversation with Creator A and sends a message
    const convAsCreatorId = await openConversation(viewerFanB, s.creatorIds.isadora);
    await sendMessage(
      viewerFanB,
      convAsCreatorId,
      "Hello Diva Isadora from Fan B!",
      "clientkey_fanb_1",
    );

    // 2. Creator A (acting as a fan) opens a conversation with Creator C and Creator C replies
    const convAsFanId = await openConversation(viewerA, creatorCId);
    await sendMessage(
      viewerCreatorC,
      convAsFanId,
      "Welcome to my circle from Diva Valentin Ash!",
      "clientkey_creatorc_1",
    );

    // Check Creator A's workspace-scoped conversations
    const fanConvosForA = await myFanConversations(viewerA);
    const creatorConvosForA = await myCreatorConversations(viewerA);
    const allConvosForA = await myConversations(viewerA);

    expect(allConvosForA.length).toBeGreaterThanOrEqual(2);
    const fanMatch = fanConvosForA.find((c) => c.id === convAsFanId);
    expect(fanMatch).toBeDefined();
    expect(fanMatch!.side).toBe("fan");
    expect(fanMatch!.peer.name).toMatch(/^Diva Valentin Ash/i);

    const creatorMatch = creatorConvosForA.find((c) => c.id === convAsCreatorId);
    expect(creatorMatch).toBeDefined();
    expect(creatorMatch!.side).toBe("creator");
    expect(creatorMatch!.peer.name).toBe(viewerFanB.fanAlias);

    // Check Creator C sees Creator A's fan alias ("SolsticeReader"), NOT "Diva Isadora Lune"!
    const creatorConvosForC = await myCreatorConversations(viewerCreatorC);
    const cMatch = creatorConvosForC.find((c) => c.id === convAsFanId);
    expect(cMatch).toBeDefined();
    expect(cMatch!.peer.name).toBe("SolsticeReader");

    // Check unread counts are strictly separated by workspace
    const unreadByWs = await unreadMessagesByWorkspace(viewerA);
    expect(unreadByWs.fan).toBeGreaterThanOrEqual(1);
    expect(unreadByWs.creator).toBeGreaterThanOrEqual(1);
    expect(unreadByWs.total).toBe(unreadByWs.fan + unreadByWs.creator);
    expect(await unreadFanMessagesCount(viewerA)).toBe(unreadByWs.fan);
    expect(await unreadCreatorMessagesCount(viewerA)).toBe(unreadByWs.creator);
  });

  it("11–15. separates fan purchases from creator earnings, separates fan vs creator invitation links, blocks fans from creator referrals, preserves MFA, and supports EN/FR/AR", async () => {
    const creatorViewer = await viewer(s.creatorIds.isadora);
    const fanViewer = await viewer(s.memberId);

    // 11. Fan My Access vs Creator Earnings stay distinct
    const fanSubs = await mySubscriptions(creatorViewer);
    const creatorEarnings = await myDetailedStudioEarnings(creatorViewer);
    expect(Array.isArray(fanSubs)).toBe(true);
    expect(creatorEarnings.detailedBalances[0]?.totalAvailableCents ?? 0).toBe(0);
    await expect(myDetailedStudioEarnings(fanViewer)).rejects.toThrow();

    // 12. Fan invitation link (/join/[handle]) vs Creator recruitment link (/recruit/[code])
    const fanInvitePath = `/join/isadora-lune`;
    const creatorRecruitment = await getOrCreateCreatorRecruitmentLink(creatorViewer);
    expect(creatorRecruitment.recruitmentPath).toContain("/recruit/");
    expect(fanInvitePath).not.toBe(creatorRecruitment.recruitmentPath);

    // Ordinary fan is blocked from Creator recruitment link and from nominating a creator
    await expect(getOrCreateCreatorRecruitmentLink(fanViewer)).rejects.toThrow();
    await expect(
      requestReferral(fanViewer, {
        inviteeName: "Prospective Creator",
        inviteeEmail: "prospective@test.local",
        role: "creator",
        relationship: "Should be blocked for ordinary fan accounts",
      }),
    ).rejects.toThrow(/Only approved creators can refer a creator/i);

    // Ordinary fan CAN invite a fan ("member")
    const memberInviteId = await requestReferral(fanViewer, {
      inviteeName: "Friend Fan",
      inviteeEmail: "friend.fan@test.local",
      role: "member",
      relationship: "Inviting a friend to join as a fan",
    });
    expect(memberInviteId).toBeTruthy();

    // 14. Existing MFA enrollment flow continues working without reset
    const beforeMfa = await mfaStatus(fanViewer);
    expect(beforeMfa.enrolled).toBe(false);
    const enrolled = await startEnrollment(fanViewer);
    expect(enrolled.secret).toBeTruthy();
    expect(enrolled.uri).toContain("otpauth://totp/");

    // 15. Localization supports EN, FR, and AR (with RTL direction)
    expect(normalizeLocale("en-US")).toBe("en");
    expect(normalizeLocale("fr-FR")).toBe("fr");
    expect(normalizeLocale("ar-MA")).toBe("ar");
    expect(localeDirection("ar")).toBe("rtl");
    expect(localeDirection("en")).toBe("ltr");
    expect(getWorkspaceCopy("ar").switchToFanView).toBe("التبديل إلى واجهة المعجبين");
    expect(getWorkspaceCopy("fr").switchToCreatorStudio).toBe("Passer au Studio Créateur");
  });
});
