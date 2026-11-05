"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/library", label: "Overview" },
  { href: "/library/vault", label: "Vault" },
  { href: "/library/memberships", label: "Memberships" },
  { href: "/library/purchases", label: "Purchases" },
] as const;

/** Section tabs. Scrolls horizontally on narrow screens instead of wrapping. */
export function LibraryNav() {
  const path = usePathname();
  return (
    <nav aria-label="Library" className="-mx-5 overflow-x-auto px-5 md:mx-0 md:px-0">
      <ul className="flex w-max gap-1 rounded-full border border-line-strong p-1">
        {TABS.map((t) => {
          const active = path === t.href;
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn("block whitespace-nowrap rounded-full px-4 py-2 text-[13px] tracking-[0.04em] transition-colors", active ? "border border-gold/40 bg-gold/[0.08] text-gold-soft" : "border border-transparent text-stone hover:text-ivory")}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
