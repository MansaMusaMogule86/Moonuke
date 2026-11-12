"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Creator workspace chrome. A persistent sidebar on desktop and a compact,
 * horizontally-scrollable tab bar on mobile. The global club navigation
 * (ClubShell) stays for cross-area moves; this is the Studio section nav.
 * Active state is derived from the pathname; access is enforced server-side
 * by the Studio layout, never here.
 */
type Section = { href: string; label: string; exact?: boolean };

export const STUDIO_SECTIONS: Section[] = [
  { href: "/studio", label: "Overview", exact: true },
  { href: "/studio/posts", label: "Content" },
  { href: "/studio/vault", label: "Vault" },
  { href: "/studio/tiers", label: "Memberships" },
  { href: "/studio/messaging", label: "Messages" },
  { href: "/studio/blasts", label: "Blasts" },
  { href: "/studio/analytics", label: "Analytics" },
  { href: "/studio/earnings", label: "Earnings" },
  { href: "/studio/participants", label: "Participants" },
  { href: "/studio/notices", label: "Notices" },
  { href: "/studio/settings", label: "Settings" },
];

function isActive(path: string, s: Section) {
  if (s.exact) return path === s.href;
  return path === s.href || path.startsWith(`${s.href}/`);
}

export function StudioShell({ alias, children }: { alias: string; children: ReactNode }) {
  const path = usePathname();

  return (
    <>
      {/* Mobile: sticky section tabs under the club header */}
      <nav
        aria-label="Studio sections"
        className="sticky top-[68px] z-30 border-b border-line bg-ink/92 backdrop-blur-md lg:hidden"
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
        {/* Desktop: persistent sidebar */}
        <aside className="hidden w-[236px] shrink-0 border-r border-line bg-ink-2/35 lg:block">
          <div className="sticky top-[84px] px-6 py-8">
            <div className="flex items-center justify-between gap-2">
              <p className="eyebrow text-gold">Creator Studio</p>
              <span className="h-2 w-2 rounded-full bg-pink shadow-[0_0_8px_var(--mk-pink)]" aria-hidden="true" />
            </div>
            <p className="mt-1.5 truncate font-display text-[20px] text-ivory" title={alias}>
              {alias}
            </p>
            <nav aria-label="Studio sections" className="mt-7">
              <ul className="space-y-1">
                {STUDIO_SECTIONS.map((s) => {
                  const active = isActive(path, s);
                  return (
                    <li key={s.href}>
                      <Link
                        href={s.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center justify-between rounded-[var(--radius-sm)] px-3.5 py-2 text-[14px] transition-colors",
                          active
                            ? "border border-gold/30 bg-gold/[0.12] font-medium text-gold-soft shadow-[0_0_20px_-8px_rgba(216,173,82,0.4)]"
                            : "border border-transparent text-stone hover:bg-ivory/[0.04] hover:text-ivory",
                        )}
                      >
                        <span>{s.label}</span>
                        {active && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-gold" />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="mt-8 border-t border-line pt-5">
              <Link
                href="/discover"
                className="text-[13px] text-stone underline decoration-line-strong underline-offset-4 transition-colors hover:text-gold-soft"
              >
                View the fan side
              </Link>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </>
  );
}
