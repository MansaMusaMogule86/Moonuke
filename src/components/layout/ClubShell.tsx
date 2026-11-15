import { brand } from "@/config/brand";
import Link from "next/link";
import type { ReactNode } from "react";
import { Symbol } from "@/components/brand/Symbol";
import { Wordmark } from "@/components/brand/Wordmark";
import {
  can,
  isVerifiedPlatformOwnerUserId,
  type Viewer,
  type WorkspaceMode,
} from "@/server/auth/permissions";
import { getWorkspaceCopy, type Locale } from "@/lib/i18n";
import { resolveWorkspaceIdentity } from "@/server/services/workspace";
import { ClubHeaderControls, ClubNav, type NavItem } from "./ClubNav";

/**
 * Signed-in chrome with strict separation between Fan View and Creator Studio:
 *   - Uses ONE primary desktop navigation system (the left sidebar).
 *   - Keeps the top bar focused on identity, notifications, localization, and
 *     explicit workspace switching (`Switch to Fan View` / `Switch to Creator Studio`).
 *   - Scopes mobile navigation strictly to the active workspace.
 *   - Never exposes `Diva [Name]` as the fan identity in Fan View.
 */
export function ClubShell({
  viewer,
  children,
  unread = 0,
  unreadMessages = 0,
  unreadFanMessages,
  unreadCreatorMessages,
  workspace,
  locale = "en",
}: {
  viewer: Viewer;
  children: ReactNode;
  unread?: number;
  unreadMessages?: number;
  unreadFanMessages?: number;
  unreadCreatorMessages?: number;
  workspace?: WorkspaceMode;
  locale?: Locale;
}) {
  const defaultWorkspace: WorkspaceMode =
    viewer.role === "creator"
      ? (workspace ?? viewer.preferredWorkspace ?? "studio")
      : "fan";

  const copy = getWorkspaceCopy(locale);
  const fanIdentity = resolveWorkspaceIdentity(viewer, "fan", locale);
  const studioIdentity = resolveWorkspaceIdentity(viewer, "studio", locale);

  const isCreator = viewer.role === "creator" && can(viewer, "club.discover");
  const isFanCapable = viewer.role === "member" || viewer.role === "creator";

  const fanUnreadBadge = unreadFanMessages ?? unreadMessages;
  const creatorUnreadBadge = unreadCreatorMessages ?? 0;

  // Fan View Navigation (5 primary destinations)
  const fanItems: NavItem[] = isFanCapable
    ? [
        { href: "/home", label: copy.fanNav.home, icon: "home", exact: true },
        { href: "/discover", label: copy.fanNav.explore, icon: "discover" },
        { href: "/messages", label: copy.fanNav.messages, icon: "messages", badge: fanUnreadBadge },
        { href: "/library", label: copy.fanNav.myAccess, icon: "library" },
        { href: "/account/security", label: copy.fanNav.account, icon: "account" },
      ]
    : [
        { href: "/discover", label: copy.fanNav.explore, icon: "discover" },
        { href: "/account/security", label: copy.fanNav.account, icon: "account" },
      ];

  const fanSecondaryItems: NavItem[] = [];
  if (can(viewer, "referrals.request")) {
    fanSecondaryItems.push({
      href: "/refer",
      label: copy.fanNav.inviteFriends,
      icon: "invite",
    });
  }
  if (viewer.role === "member") {
    fanSecondaryItems.push({
      href: "/account/security#creator-application",
      label: copy.fanNav.applyCreator,
      icon: "studio",
    });
  }
  if (isVerifiedPlatformOwnerUserId(viewer.id) && can(viewer, "owner.dashboard.view")) {
    fanSecondaryItems.push({ href: "/owner", label: "Owner", icon: "house" });
  }
  if (can(viewer, "applications.review")) {
    fanSecondaryItems.push({ href: "/admin", label: "Admin", icon: "house" });
  }

  // Creator Studio Navigation (11 primary destinations + secondary compliance/account links)
  const studioItems: NavItem[] = isCreator
    ? [
        { href: "/studio", label: copy.studioNav.overview, icon: "studio", exact: true },
        { href: "/studio/posts", label: copy.studioNav.posts, icon: "posts" },
        { href: "/studio/vault", label: copy.studioNav.mediaVault, icon: "vault" },
        {
          href: "/studio/messaging",
          label: copy.studioNav.inbox,
          icon: "messages",
          badge: creatorUnreadBadge,
        },
        { href: "/studio/blasts", label: copy.studioNav.blasts, icon: "blasts" },
        { href: "/studio/analytics", label: copy.studioNav.members, icon: "members" },
        { href: "/studio/tiers", label: copy.studioNav.tiers, icon: "tiers" },
        { href: "/studio/earnings", label: copy.studioNav.earnings, icon: "earnings" },
        { href: "/studio/referrals", label: copy.studioNav.referrals, icon: "referrals" },
        { href: "/studio/notices", label: copy.studioNav.notifications, icon: "notices" },
        { href: "/studio/settings", label: copy.studioNav.settings, icon: "settings" },
      ]
    : [];

  const studioSecondaryItems: NavItem[] = isCreator
    ? [
        {
          href: "/studio/participants",
          label: copy.studioNav.participants,
          icon: "participants",
        },
        {
          href: "/account/security",
          label: copy.fanNav.account,
          icon: "account",
        },
      ]
    : [];

  const homeHref =
    viewer.role === "owner"
      ? isVerifiedPlatformOwnerUserId(viewer.id)
        ? "/owner"
        : "/admin"
      : defaultWorkspace === "studio" && isCreator
        ? "/studio"
        : "/home";

  return (
    <div className="min-h-[100svh] pb-[calc(68px+env(safe-area-inset-bottom))] md:pb-0">
      <header className="sticky top-0 z-50 border-b border-line bg-ink/85 backdrop-blur-md">
        <div className="mx-auto flex h-[68px] max-w-[1600px] items-center justify-between gap-4 px-5 md:px-8">
          <Link href={homeHref} className="flex items-center gap-3 rounded-md">
            <span className="sr-only">{`${brand.name} — Home`}</span>
            <Symbol size={36} />
            <Wordmark decorative tone="duotone" className="hidden text-[15px] sm:inline-flex" />
          </Link>

          <ClubHeaderControls
            isCreator={isCreator}
            isOwner={viewer.role === "owner"}
            defaultWorkspace={defaultWorkspace}
            fanDisplayName={fanIdentity.displayName}
            creatorDisplayName={studioIdentity.displayName}
            ownerDisplayName={fanIdentity.displayName}
            unreadNotifications={unread}
            locale={locale}
          />
        </div>
      </header>

      <div className="mx-auto flex max-w-[1600px]">
        <ClubNav
          fanItems={fanItems}
          fanSecondaryItems={fanSecondaryItems}
          studioItems={studioItems}
          studioSecondaryItems={studioSecondaryItems}
          isCreator={isCreator}
          defaultWorkspace={defaultWorkspace}
          creatorDisplayName={studioIdentity.displayName}
          fanDisplayName={fanIdentity.displayName}
          locale={locale}
          variant="sidebar"
        />
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 outline-none">
          {children}
        </main>
      </div>

      <ClubNav
        fanItems={fanItems}
        studioItems={studioItems}
        isCreator={isCreator}
        defaultWorkspace={defaultWorkspace}
        locale={locale}
        variant="bottom"
      />
    </div>
  );
}
