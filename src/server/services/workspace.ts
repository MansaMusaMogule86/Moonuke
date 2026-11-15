import "server-only";
import { asViewer } from "@/server/db";
import {
  can,
  isVerifiedPlatformOwnerUserId,
  VERIFIED_OWNER_USER_IDS,
  type Viewer,
  type WorkspaceMode,
} from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import { formatCreatorPublicName } from "@/lib/creatorName";
import { getWorkspaceCopy, type Locale } from "@/lib/i18n";
import { checkText } from "@/server/ai/safety";
import { getOnboarding } from "./creatorOnboarding";

/**
 * Validates that a post-login `next` path is a safe internal relative route
 * AND that the authenticated viewer is authorized to open it.
 */
export function isSafeAuthorizedDeepLink(
  viewer: Viewer,
  nextPath: string | null | undefined,
): nextPath is string {
  if (!nextPath || typeof nextPath !== "string") return false;
  const trimmed = nextPath.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\")) return false;
  if (/[\x00-\x1F\x7F]/.test(trimmed)) return false;

  const pathname = trimmed.split("?")[0].split("#")[0];

  // Never bounce back to authentication/public entry gates
  const disallowedAuthPrefixes = [
    "/signin",
    "/signup",
    "/forgot",
    "/reset",
    "/pending",
    "/invite",
    "/unavailable",
  ];
  if (
    trimmed === "/" ||
    disallowedAuthPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    return false;
  }

  // Role-based deep link authorization
  if (pathname === "/owner" || pathname.startsWith("/owner/")) {
    return (
      viewer.role === "owner" &&
      viewer.aal === 2 &&
      isVerifiedPlatformOwnerUserId(viewer.id) &&
      can(viewer, "owner.dashboard.view")
    );
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return can(viewer, "applications.review");
  }

  if (
    pathname === "/studio" ||
    pathname.startsWith("/studio/") ||
    pathname === "/messages/new"
  ) {
    return viewer.role === "creator" && viewer.status === "active" && can(viewer, "club.discover");
  }

  // Fan & shared routes (/home, /discover, /c/[handle], /library, /messages, /account, /notifications, /refer)
  if (viewer.role === "owner") {
    return can(viewer, "club.discover");
  }
  return viewer.status === "active" && (viewer.role === "member" || viewer.role === "creator");
}

/**
 * Resolves the post-login destination for any authenticated viewer:
 *   1. Enforces MFA challenge or mandatory owner MFA setup first.
 *   2. Preserves legitimate authorized deep links (`requestedNext`).
 *   3. Routes Owners to `/owner` (verified owners) or `/admin`.
 *   4. Routes Creators with unfinished onboarding to `/studio/settings` (resuming
 *      at their current setup step without resetting completed setup), and
 *      approved/configured creators to `/studio`.
 *   5. Routes Fans (`member`) to `/home` (the fan dashboard).
 */
export async function resolvePostLoginDestination(
  viewer: Viewer,
  requestedNext?: string | null,
): Promise<string> {
  const safeNext =
    requestedNext &&
    requestedNext.startsWith("/") &&
    !requestedNext.startsWith("//") &&
    !requestedNext.includes("\\")
      ? requestedNext.trim()
      : null;

  if (viewer.mfa === "pending") {
    return safeNext ? `/signin/verify?next=${encodeURIComponent(safeNext)}` : "/signin/verify";
  }
  if (viewer.role === "owner" && viewer.mfa === "none") {
    return "/account/security?setup=required";
  }
  if (viewer.status !== "active") {
    return "/pending";
  }

  if (isSafeAuthorizedDeepLink(viewer, safeNext)) {
    return safeNext;
  }

  if (viewer.role === "owner") {
    return isVerifiedPlatformOwnerUserId(viewer.id) ? "/owner" : "/admin";
  }

  if (viewer.role === "creator") {
    try {
      const ob = await getOnboarding(viewer);
      const unfinishedOnboarding =
        !ob.profile ||
        ob.profile.needsNameSetup ||
        ob.verification.status === "not_started" ||
        ob.verification.status === "needs_more_info";
      return unfinishedOnboarding ? "/studio/settings" : "/studio";
    } catch {
      return "/studio";
    }
  }

  return "/home";
}

/**
 * Determines which workspace ("studio" vs "fan") is active for the current
 * request:
 *   - Ordinary fans (`role === "member"`): always `"fan"`.
 *   - Explicit `/studio*` routes for creators: always `"studio"`.
 *   - Explicit fan routes (`/home`, `/discover`, `/c/*`, `/library*`, `/messages*`, `/refer`):
 *     always `"fan"`.
 *   - Shared routes (`/account/*`, `/notifications`): respects the remembered
 *     workspace cookie or DB preference (`preferredWorkspace`), defaulting to
 *     `"studio"` for creators and `"fan"` for members.
 */
export function resolveActiveWorkspace(
  viewer: Viewer,
  pathname?: string | null,
  cookieWorkspace?: string | null,
): WorkspaceMode {
  if (viewer.role !== "creator") {
    return "fan";
  }

  const p = (pathname ?? "").split("?")[0];
  if (p === "/studio" || p.startsWith("/studio/")) {
    return "studio";
  }

  const fanExplicitPrefixes = ["/home", "/discover", "/c/", "/library", "/messages", "/refer"];
  if (fanExplicitPrefixes.some((prefix) => p === prefix || p.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`))) {
    return "fan";
  }

  if (cookieWorkspace === "fan" || cookieWorkspace === "studio") {
    return cookieWorkspace;
  }

  return viewer.preferredWorkspace === "fan" ? "fan" : "studio";
}

export type WorkspaceIdentity = {
  workspace: WorkspaceMode;
  displayName: string;
  roleBadge: string;
  workspaceBadge: string;
  canSwitchWorkspace: boolean;
  switchTargetWorkspace: WorkspaceMode | null;
  switchLabel: string | null;
  switchHref: string | null;
};

/**
 * Resolves the strictly separated public identity for the active workspace:
 *   - Creator Studio uses the public creator identity (`Diva Isadora Lune`).
 *   - Fan View uses the account's separate `fanAlias` (never exposing the
 *     creator identity `Diva [Name]` or private email address).
 */
export function resolveWorkspaceIdentity(
  viewer: Viewer,
  workspace: WorkspaceMode,
  locale: Locale = "en",
): WorkspaceIdentity {
  const copy = getWorkspaceCopy(locale);

  if (viewer.role === "owner") {
    const ownerName =
      viewer.id === VERIFIED_OWNER_USER_IDS.OWNER_001
        ? "Jade"
        : viewer.id === VERIFIED_OWNER_USER_IDS.OWNER_002
          ? "Kael Veyre"
          : viewer.alias;
    return {
      workspace: "fan",
      displayName: ownerName,
      roleBadge: copy.ownerRoleBadge,
      workspaceBadge: copy.ownerWorkspaceBadge,
      canSwitchWorkspace: false,
      switchTargetWorkspace: null,
      switchLabel: null,
      switchHref: null,
    };
  }

  if (viewer.role === "creator") {
    const creatorPublicName =
      viewer.creatorDisplayName ?? formatCreatorPublicName(viewer.alias);
    const rawFanAlias = viewer.fanAlias?.trim();
    const safeFanAlias =
      rawFanAlias &&
      !rawFanAlias.toLowerCase().startsWith("diva ") &&
      rawFanAlias.toLowerCase() !== creatorPublicName.toLowerCase() &&
      rawFanAlias.toLowerCase() !== creatorPublicName.replace(/^diva\s+/i, "").toLowerCase() &&
      !rawFanAlias.includes("@")
        ? rawFanAlias
        : `Member ${viewer.id.slice(0, 4).toUpperCase()}`;

    if (workspace === "studio") {
      return {
        workspace: "studio",
        displayName: creatorPublicName,
        roleBadge: copy.creatorStudioRoleBadge,
        workspaceBadge: copy.studioWorkspaceBadge,
        canSwitchWorkspace: true,
        switchTargetWorkspace: "fan",
        switchLabel: copy.switchToFanView,
        switchHref: "/home",
      };
    }

    return {
      workspace: "fan",
      displayName: safeFanAlias,
      roleBadge: copy.fanRoleBadge,
      workspaceBadge: copy.fanWorkspaceBadge,
      canSwitchWorkspace: true,
      switchTargetWorkspace: "studio",
      switchLabel: copy.switchToCreatorStudio,
      switchHref: "/studio",
    };
  }

  // Ordinary Fan (`role === "member"`)
  const fanDisplay =
    viewer.fanAlias && !viewer.fanAlias.includes("@")
      ? viewer.fanAlias
      : viewer.alias;
  return {
    workspace: "fan",
    displayName: fanDisplay,
    roleBadge: copy.fanRoleBadge,
    workspaceBadge: copy.fanWorkspaceBadge,
    canSwitchWorkspace: false,
    switchTargetWorkspace: null,
    switchLabel: null,
    switchHref: null,
  };
}

/**
 * Switches the viewer's remembered workspace (`"studio"` or `"fan"`).
 * Switching view NEVER changes account roles, grants capabilities, or bypasses
 * authorization; ordinary fans attempting to switch to `"studio"` are rejected.
 */
export async function switchWorkspace(
  viewer: Viewer,
  targetWorkspace: WorkspaceMode,
): Promise<{ workspace: WorkspaceMode; redirectTo: string }> {
  if (viewer.status !== "active") {
    throw new AppError("forbidden", "Account is not active.");
  }
  if (targetWorkspace !== "fan" && targetWorkspace !== "studio") {
    throw new AppError("validation", "Invalid workspace selection.");
  }
  if (targetWorkspace === "studio" && viewer.role !== "creator") {
    throw new AppError("forbidden", "Only approved creators can access Creator Studio.");
  }

  await asViewer(viewer, async (q) => {
    await q.query(`select app.set_my_workspace($1)`, [targetWorkspace]);
  });

  return {
    workspace: targetWorkspace,
    redirectTo: targetWorkspace === "studio" ? "/studio" : "/home",
  };
}

/**
 * Reads the current account's Fan View alias.
 */
export async function getMyFanAlias(viewer: Viewer): Promise<string> {
  if (viewer.status !== "active") throw new AppError("forbidden", "Not allowed.");
  return asViewer(viewer, async (q) => {
    const r = await q.one<{ fan_alias: string }>(
      `select fan_alias::text as fan_alias from app.users where id = $1`,
      [viewer.id],
    );
    return r?.fan_alias ?? viewer.fanAlias ?? viewer.alias;
  });
}

/**
 * Updates the account's Fan View alias (`app.users.fan_alias`).
 * For creators, enforces that the fan alias stays distinct from their `Diva [Name]`
 * creator identity while keeping the same immutable `viewer.id` UUID.
 */
export async function updateMyFanAlias(
  viewer: Viewer,
  rawFanAlias: string,
): Promise<{ userId: string; fanAlias: string }> {
  if (viewer.status !== "active" || (viewer.role !== "member" && viewer.role !== "creator")) {
    throw new AppError("forbidden", "Not allowed.");
  }

  const cleaned = (rawFanAlias ?? "")
    .replace(/[\x00-\x1F\x7F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length < 2 || cleaned.length > 40) {
    throw new AppError("validation", "Enter a fan alias between 2 and 40 characters.", "fanAlias");
  }
  if (/[<>@]/.test(cleaned)) {
    throw new AppError("validation", "Fan alias cannot contain email addresses or angle brackets.", "fanAlias");
  }
  if (/^diva(\s+|[:._·—–-]+|$)/i.test(cleaned)) {
    throw new AppError(
      "validation",
      "Fan aliases cannot start with the 'Diva' creator prefix.",
      "fanAlias",
    );
  }

  const safety = checkText(cleaned);
  if (!safety.ok) {
    throw new AppError("validation", safety.reason ?? "Choose another fan alias.", "fanAlias");
  }

  return asViewer(viewer, async (q) => {
    try {
      const r = await q.one<{ alias: string }>(`select app.set_my_fan_alias($1) as alias`, [cleaned]);
      return { userId: viewer.id, fanAlias: r!.alias };
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (err.code === "23505") {
        throw new AppError("conflict", "That fan alias is already taken.", "fanAlias");
      }
      if (err.code === "23514") {
        throw new AppError(
          "validation",
          err.message?.includes("distinct from your public creator")
            ? "Your Fan View alias must be different from your public Diva creator name."
            : "Enter a valid fan alias (2–40 characters, distinct from your creator name).",
          "fanAlias",
        );
      }
      throw e;
    }
  });
}

