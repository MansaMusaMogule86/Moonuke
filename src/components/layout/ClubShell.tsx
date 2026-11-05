import Link from "next/link";
import type { ReactNode } from "react";
import { Symbol } from "@/components/brand/Symbol";
import { Wordmark } from "@/components/brand/Wordmark";
import { Submit } from "@/components/forms";
import { can, type Viewer } from "@/server/auth/permissions";
import { signOutAction } from "@/server/actions/auth";
import { ClubNav, type NavItem } from "./ClubNav";

/**
 * Signed-in chrome. Navigation items are derived from server-side permissions
 * purely for UX — every destination re-checks access itself.
 */
export function ClubShell({ viewer, children }: { viewer: Viewer; children: ReactNode }) {
  const items: NavItem[] = [{ href: "/discover", label: "Discover", icon: "discover" }];
  if (can(viewer, "referrals.request")) items.push({ href: "/refer", label: "Invite", icon: "invite" });
  if (can(viewer, "applications.review")) items.push({ href: "/admin", label: "House", icon: "house" });

  return (
    <div className="min-h-[100svh] pb-24 md:pb-0">
      <header className="sticky top-0 z-50 border-b border-line bg-ink/85 backdrop-blur-md">
        <div className="mx-auto flex h-[68px] max-w-[1600px] items-center justify-between gap-6 px-5 md:px-10">
          <Link href="/discover" className="flex items-center gap-3 rounded-md">
            <span className="sr-only">Moonuke — Discover</span>
            <Symbol size={28} />
            <Wordmark decorative className="hidden text-[14px] sm:inline-flex" />
          </Link>
          <ClubNav items={items} variant="top" />
          <div className="flex items-center gap-3">
            <span className="hidden text-right text-[13px] leading-tight sm:block">
              <span className="block text-ivory">{viewer.alias}</span>
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
