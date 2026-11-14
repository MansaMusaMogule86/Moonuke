"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export type NavItem = {
  href: string;
  label: string;
  icon: "home" | "discover" | "invite" | "house" | "account" | "studio" | "library" | "messages";
  badge?: number;
};

const icons: Record<NavItem["icon"], React.ReactNode> = {
  home: <path d="M3 9.2 10 3l7 6.2V16.5H12.5v-4.5h-5v4.5H3V9.2Z" />,
  discover: <path d="M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Zm3 4.5-1.8 4.2L7 13l1.8-4.2L13 7Z" />,
  invite: <path d="M3 5.5h14v9H3zM3.5 6l6.5 5 6.5-5" />,
  house: <path d="M10 2.5 3 6.5v1h14v-1L10 2.5ZM4.5 8.5v6M8 8.5v6M12 8.5v6M15.5 8.5v6M3 16h14" />,
  studio: <path d="M3 16.5h14M5 16.5V9l5-5.5L15 9v7.5M8 16.5v-4h4v4" />,
  library: <path d="M4 3.5h3v13H4zM8.5 3.5h3v13h-3zM13 4.2l2.8-.7 2.7 12.4-2.8.6z" />,
  messages: <path d="M3.5 4.5h13v9h-7l-4 3v-3h-2z" />,
  account: <path d="M10 2.5 4 5v4.5c0 3.6 2.6 6.6 6 8 3.4-1.4 6-4.4 6-8V5l-6-2.5Zm-2.5 7.5 2 2 3.5-4" />,
};

export function ClubNav({
  items,
  secondaryItems = [],
  variant,
}: {
  items: NavItem[];
  secondaryItems?: NavItem[];
  variant: "top" | "sidebar" | "bottom";
}) {
  const path = usePathname();
  const isActive = (href: string) => {
    if (href === "/account/security") return path.startsWith("/account");
    if (href === "/discover") return path === "/discover" || path.startsWith("/discover/") || path.startsWith("/c/");
    return path === href || path.startsWith(`${href}/`);
  };

  if (variant === "sidebar") {
    // When inside Creator Studio, StudioShell provides its own left sidebar.
    if (path.startsWith("/studio")) return null;
    return (
      <aside
        aria-label="Primary fan navigation"
        className="hidden w-60 shrink-0 border-r border-line bg-obsidian/45 md:block"
      >
        <div className="sticky top-[68px] flex h-[calc(100svh-68px)] flex-col justify-between px-4 py-6">
          <div className="space-y-6">
            <div>
              <p className="px-3 text-[10px] uppercase tracking-[0.24em] text-ash">Navigation</p>
              <ul className="mt-2 space-y-1">
                {items.map((it) => {
                  const active = isActive(it.href);
                  return (
                    <li key={it.href}>
                      <Link
                        href={it.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center justify-between rounded-[var(--radius-md)] px-3.5 py-2.5 text-[14px] transition-colors",
                          active
                            ? "border border-gold/35 bg-gold/[0.1] font-medium text-gold-soft"
                            : "border border-transparent text-stone hover:bg-surface/60 hover:text-ivory",
                        )}
                      >
                        <span className="flex items-center gap-3">
                          <svg
                            aria-hidden
                            viewBox="0 0 20 20"
                            className="h-[18px] w-[18px] shrink-0"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinejoin="round"
                          >
                            {icons[it.icon]}
                          </svg>
                          <span>{it.label}</span>
                        </span>
                        {!!it.badge && it.badge > 0 && (
                          <span
                            aria-label={`${it.badge} unread`}
                            className="grid h-5 min-w-5 place-items-center rounded-full bg-gold px-1.5 text-[11px] font-semibold text-ink"
                          >
                            {it.badge > 99 ? "99+" : it.badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>

            {secondaryItems.length > 0 && (
              <div className="border-t border-line pt-5">
                <p className="px-3 text-[10px] uppercase tracking-[0.24em] text-ash">Workspace</p>
                <ul className="mt-2 space-y-1">
                  {secondaryItems.map((it) => {
                    const active = isActive(it.href);
                    return (
                      <li key={it.href}>
                        <Link
                          href={it.href}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex items-center gap-3 rounded-[var(--radius-md)] px-3.5 py-2 text-[13px] transition-colors",
                            active
                              ? "border border-gold/35 bg-gold/[0.1] text-gold-soft"
                              : "border border-transparent text-stone hover:bg-surface/60 hover:text-ivory",
                          )}
                        >
                          <svg
                            aria-hidden
                            viewBox="0 0 20 20"
                            className="h-4 w-4 shrink-0"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinejoin="round"
                          >
                            {icons[it.icon]}
                          </svg>
                          <span>{it.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          <div className="rounded-[var(--radius-md)] border border-line bg-ink/50 p-3.5 text-[12px] text-stone">
            <p className="font-medium text-ivory">Member Sanctuary</p>
            <p className="mt-1 leading-relaxed text-ash">
              Subscriptions, unlocked posts, and unlocked messages stay available in My Access.
            </p>
          </div>
        </div>
      </aside>
    );
  }

  if (variant === "top") {
    return (
      <nav aria-label="Club" className="hidden md:block">
        <ul className="flex items-center gap-1 rounded-full border border-line-strong p-1">
          {[...items, ...secondaryItems].map((it) => {
            const active = isActive(it.href);
            return (
              <li key={it.href} className="relative">
                {active && (
                  <motion.span
                    layoutId="club-pill"
                    className="absolute inset-0 rounded-full border border-gold/40 bg-gold/[0.08]"
                    transition={{ type: "spring", stiffness: 380, damping: 34 }}
                  />
                )}
                <Link
                  href={it.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] tracking-[0.04em] transition-colors",
                    active ? "text-gold-soft" : "text-stone hover:text-ivory",
                  )}
                >
                  <span>{it.label}</span>
                  {!!it.badge && it.badge > 0 && (
                    <span className="grid h-4 min-w-4 place-items-center rounded-full bg-gold px-1 text-[10px] font-semibold text-ink">
                      {it.badge > 9 ? "9+" : it.badge}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }

  return (
    <nav
      aria-label="Mobile fan navigation"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-ink/95 backdrop-blur-md md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {items.map((it) => {
          const active = isActive(it.href);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-[60px] flex-col items-center justify-center gap-1 px-1 text-[11px] tracking-[0.04em] transition-colors",
                  active ? "font-medium text-gold" : "text-stone hover:text-ivory",
                )}
              >
                <span className="relative">
                  <svg
                    aria-hidden
                    viewBox="0 0 20 20"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                  >
                    {icons[it.icon]}
                  </svg>
                  {!!it.badge && it.badge > 0 && (
                    <span
                      aria-label={`${it.badge} unread`}
                      className="absolute -right-2.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-gold px-1 text-[10px] font-semibold text-ink"
                    >
                      {it.badge > 9 ? "9+" : it.badge}
                    </span>
                  )}
                </span>
                <span className="truncate">{it.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
