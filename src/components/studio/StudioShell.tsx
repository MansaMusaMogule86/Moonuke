"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Creator Studio workspace container.
 * Desktop navigation is rendered in the unified single left sidebar inside ClubShell.
 * On mobile viewports (< md), StudioShell renders a scrollable section strip beneath
 * the top header so every Creator Studio destination is reachable alongside the
 * Studio mobile bottom bar.
 */
type Section = { href: string; label: string; exact?: boolean };

export const STUDIO_SECTIONS: Section[] = [
  { href: "/studio", label: "Overview", exact: true },
  { href: "/studio/posts", label: "Posts" },
  { href: "/studio/vault", label: "Media Vault" },
  { href: "/studio/messaging", label: "Inbox" },
  { href: "/studio/blasts", label: "Blasts" },
  { href: "/studio/analytics", label: "Members" },
  { href: "/studio/tiers", label: "Tiers" },
  { href: "/studio/earnings", label: "Earnings" },
  { href: "/studio/referrals", label: "Referrals" },
  { href: "/studio/notices", label: "Notifications" },
  { href: "/studio/settings", label: "Settings" },
  { href: "/studio/participants", label: "Participants" },
];

function isActive(path: string, s: Section) {
  if (s.exact) return path === s.href;
  return path === s.href || path.startsWith(`${s.href}/`);
}

export function StudioShell({ alias, children }: { alias: string; children: ReactNode }) {
  const path = usePathname();

  return (
    <>
      {/* Mobile: sticky section tabs under the header so all 12 Studio sections are accessible */}
      <nav
        aria-label={`Studio sections for ${alias}`}
        className="sticky top-[68px] z-30 border-b border-line bg-ink/92 backdrop-blur-md md:hidden"
      >
        <ul className="flex gap-1 overflow-x-auto px-5 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {STUDIO_SECTIONS.map((s) => {
            const active = isActive(path, s);
            return (
              <li key={s.href}>
                <Link
                  href={s.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "block whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] transition-colors",
                    active ? "bg-gold/[0.12] text-gold-soft" : "text-stone hover:text-ivory",
                  )}
                >
                  {s.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="smoke-minimal mx-auto flex w-full max-w-[1520px]">
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </>
  );
}
