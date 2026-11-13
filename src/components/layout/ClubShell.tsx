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
import { ClubNav, type NavItem } from "./ClubNav";

/**
 * Signed-in chrome. Navigation items are derived from server-side permissions
 * purely for UX — every destination re-checks access itself.
 */
export function ClubShell({ viewer, children, unread = 0 }: { viewer: Viewer; children: ReactNode; unread?: number }) {
  const displayAlias =
    viewer.id === VERIFIED_OWNER_USER_IDS.OWNER_001
      ? "Jade"
      : viewer.id === VERIFIED_OWNER_USER_IDS.OWNER_002
        ? "Kael Veyre"
        : viewer.alias;

  const items: NavItem[] = [{ href: "/discover", label: "Discover", icon: "discover" }];
  if (viewer.role === "member" || viewer.role === "creator") {
    items.push({ href: "/library", label: "Library", icon: "library" });
    items.push({ href: "/messages", label: "Messages", icon: "messages" });
  }
  if (viewer.role === "creator" && can(viewer, "club.discover")) items.push({ href: "/studio", label: "Studio", icon: "studio" });
  if (can(viewer, "referrals.request")) items.push({ href: "/refer", label: "Invite", icon: "invite" });
  if (isVerifiedPlatformOwnerUserId(viewer.id) && can(viewer, "owner.dashboard.view")) {
    items.push({ href: "/owner", label: "Owner", icon: "house" });
  }
  if (can(viewer, "applications.review")) items.push({ href: "/admin", label: "Admin", icon: "house" });
  items.push({ href: "/account/security", label: "Account", icon: "account" });

  return (
    <div className="min-h-[100svh] pb-24 md:pb-0">
      <header className="sticky top-0 z-50 border-b border-line bg-ink/85 backdrop-blur-md">
        <div className="mx-auto flex h-[68px] max-w-[1600px] items-center justify-between gap-6 px-5 md:px-10">
          <Link href="/discover" className="flex items-center gap-3 rounded-md">
            <span className="sr-only">{`${brand.name} — Discover`}</span>
            <Symbol size={36} />
            <Wordmark decorative tone="duotone" className="hidden text-[15px] sm:inline-flex" />
          </Link>
          <ClubNav items={items} variant="top" />
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
                <span aria-hidden className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-gold px-1 text-[11px] font-medium text-ink">{unread > 9 ? "9+" : unread}</span>
              )}
            </Link>
            <span className="hidden text-right text-[13px] leading-tight sm:block">
              <span className="block text-ivory">{displayAlias}</span>
              <span className="block text-[11px] uppercase tracking-[0.18em] text-ash">{viewer.role === "owner" ? "Owner" : viewer.role}</span>
            </span>
            <form action={signOutAction}>
              <Submit variant="ghost" className="h-10 px-4 text-[13px]">Sign out</Submit>
            </form>
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="outline-none">
        {children}
      </main>
      <ClubNav items={items} variant="bottom" />
    </div>
  );
}
