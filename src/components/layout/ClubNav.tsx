"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export type NavItem = { href: string; label: string; icon: "discover" | "invite" | "house" | "account" | "studio" | "library" };

const icons: Record<NavItem["icon"], React.ReactNode> = {
  discover: <path d="M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Zm3 4.5-1.8 4.2L7 13l1.8-4.2L13 7Z" />,
  invite: <path d="M3 5.5h14v9H3zM3.5 6l6.5 5 6.5-5" />,
  house: <path d="M10 2.5 3 6.5v1h14v-1L10 2.5ZM4.5 8.5v6M8 8.5v6M12 8.5v6M15.5 8.5v6M3 16h14" />,
  studio: <path d="M3 16.5h14M5 16.5V9l5-5.5L15 9v7.5M8 16.5v-4h4v4" />,
  library: <path d="M4 3.5h3v13H4zM8.5 3.5h3v13h-3zM13 4.2l2.8-.7 2.7 12.4-2.8.6z" />,
  account: <path d="M10 2.5 4 5v4.5c0 3.6 2.6 6.6 6 8 3.4-1.4 6-4.4 6-8V5l-6-2.5Zm-2.5 7.5 2 2 3.5-4" />,
};

export function ClubNav({ items, variant }: { items: NavItem[]; variant: "top" | "bottom" }) {
  const path = usePathname();
  const isActive = (href: string) => path === href || path.startsWith(`${href}/`) || (href === "/discover" && path.startsWith("/c/"));

  if (variant === "top") {
    return (
      <nav aria-label="Club" className="hidden md:block">
        <ul className="flex items-center gap-1 rounded-full border border-line-strong p-1">
          {items.map((it) => {
            const active = isActive(it.href);
            return (
              <li key={it.href} className="relative">
                {active && (
                  <motion.span layoutId="club-pill" className="absolute inset-0 rounded-full border border-gold/40 bg-gold/[0.08]" transition={{ type: "spring", stiffness: 380, damping: 34 }} />
                )}
                <Link
                  href={it.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("relative block rounded-full px-4 py-2 text-[13px] tracking-[0.04em] transition-colors", active ? "text-gold-soft" : "text-stone hover:text-ivory")}
                >
                  {it.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }

  return (
    <nav aria-label="Club" className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-ink/92 backdrop-blur-md md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <ul className="mx-auto flex max-w-md justify-around">
        {items.map((it) => {
          const active = isActive(it.href);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={cn("flex min-h-[60px] min-w-[72px] flex-col items-center justify-center gap-1 text-[11px] tracking-[0.08em]", active ? "text-gold" : "text-stone")}
              >
                <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
                  {icons[it.icon]}
                </svg>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
