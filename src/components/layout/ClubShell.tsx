import { brand } from "@/config/brand";
import Link from "next/link";
import type { ReactNode } from "react";
import { Symbol } from "@/components/brand/Symbol";
import { Wordmark } from "@/components/brand/Wordmark";
import { Submit } from "@/components/forms";
import {
  can,
  isVerifiedPlatformOwnerUserId,
  VERIFIED_OWNER_USER_IDS,
  type Viewer,
} from "@/server/auth/permissions";
import { signOutAction } from "@/server/actions/auth";
import { formatCreatorPublicName } from "@/lib/creatorName";
import { ClubNav, type NavItem } from "./ClubNav";

/**
 * Signed-in chrome.
 * Fan navigation exposes five clear destinations:
 *   1. Home (/home)
 *   2. Explore (/discover)
 *   3. Messages (/messages)
 *   4. My Access (/library)
 *   5. Account (/account/security)
 * Creator Studio and Owner tools are kept strictly in secondary workspace links
 * and never shown to ordinary fan accounts.
 */
export function ClubShell({
  viewer,
  children,
  unread = 0,
  unreadMessages = 0,
}: {
  viewer: Viewer;
  children: ReactNode;
  unread?: number;
  unreadMessages?: number;
}) {
  const displayAlias =
    viewer.id === VERIFIED_OWNER_USER_IDS.OWNER_001
      ? "Jade"
      : viewer.id === VERIFIED_OWNER_USER_IDS.OWNER_002
        ? "Kael Veyre"
        : viewer.role === "creator"
          ? formatCreatorPublicName(viewer.alias)
          : viewer.alias;

  const isFanCapable = viewer.role === "member" || viewer.role === "creator";

  const primaryItems: NavItem[] = isFanCapable
    ? [
        { href: "/home", label: "Home", icon: "home" },
        { href: "/discover", label: "Explore", icon: "discover" },
        { href: "/messages", label: "Messages", icon: "messages", badge: unreadMessages },
        { href: "/library", label: "My Access", icon: "library" },
        { href: "/account/security", label: "Account", icon: "account" },
      ]
    : [
        { href: "/discover", label: "Explore", icon: "discover" },
        { href: "/account/security", label: "Account", icon: "account" },
      ];

  const secondaryItems: NavItem[] = [];
  if (viewer.role === "creator" && can(viewer, "club.discover")) {
    secondaryItems.push({ href: "/studio", label: "Creator Studio", icon: "studio" });
  }
  if (can(viewer, "referrals.request")) {
    secondaryItems.push({ href: "/refer", label: "Invite Someone", icon: "invite" });
  }
  if (isVerifiedPlatformOwnerUserId(viewer.id) && can(viewer, "owner.dashboard.view")) {
    secondaryItems.push({ href: "/owner", label: "Owner", icon: "house" });
  }
  if (can(viewer, "applications.review")) {
    secondaryItems.push({ href: "/admin", label: "Admin", icon: "house" });
  }

  return (
    <div className="min-h-[100svh] pb-[calc(68px+env(safe-area-inset-bottom))] md:pb-0">
      <header className="sticky top-0 z-50 border-b border-line bg-ink/85 backdrop-blur-md">
        <div className="mx-auto flex h-[68px] max-w-[1600px] items-center justify-between gap-4 px-5 md:px-8">
          <Link href={isFanCapable ? "/home" : "/discover"} className="flex items-center gap-3 rounded-md">
            <span className="sr-only">{`${brand.name} — Home`}</span>
            <Symbol size={36} />
            <Wordmark decorative tone="duotone" className="hidden text-[15px] sm:inline-flex" />
          </Link>
          <div className="hidden xl:block">
            <ClubNav items={primaryItems} secondaryItems={secondaryItems} variant="top" />
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/notifications"
              className="relative grid h-10 w-10 place-items-center rounded-full border border-line-strong text-stone hover:text-ivory"
              aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
            >
              <svg aria-hidden viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
                <path d="M10 2.8a4.7 4.7 0 0 0-4.7 4.7v2.9L3.8 13.5h12.4l-1.5-3.1V7.5A4.7 4.7 0 0 0 10 2.8ZM8 15.6a2 2 0 0 0 4 0" />
              </svg>
              {unread > 0 && (
                <span aria-hidden className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-gold px-1 text-[11px] font-medium text-ink">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
            <span className="hidden text-right text-[13px] leading-tight sm:block">
              <span className="block font-medium text-ivory">{displayAlias}</span>
              <span className="block text-[11px] uppercase tracking-[0.18em] text-ash">
                {viewer.role === "owner" ? "Owner" : viewer.role === "member" ? "Fan" : viewer.role}
              </span>
            </span>
            <form action={signOutAction}>
              <Submit variant="ghost" className="h-10 px-4 text-[13px]">Sign out</Submit>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-[1600px]">
        <ClubNav items={primaryItems} secondaryItems={secondaryItems} variant="sidebar" />
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 outline-none">
          {children}
        </main>
      </div>
      <ClubNav items={primaryItems} variant="bottom" />
    </div>
  );
}
