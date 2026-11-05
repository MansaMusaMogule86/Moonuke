"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const tabs = [
  { href: "/admin", label: "Applications" },
  { href: "/admin/invitations", label: "Invitations" },
  { href: "/admin/referrals", label: "Referrals" },
  { href: "/admin/onboarding", label: "Onboarding" },
  { href: "/admin/creators", label: "Creators" },
  { href: "/admin/moderation", label: "Moderation" },
  { href: "/admin/members", label: "Members" },
  { href: "/admin/email", label: "Email" },
  { href: "/admin/audit", label: "Audit log" },
];

export function AdminTabs() {
  const path = usePathname();
  return (
    <nav aria-label="House sections" className="-mx-5 overflow-x-auto px-5 md:mx-0 md:px-0">
      <ul className="flex w-max gap-1 border-b border-line md:w-full">
        {tabs.map((t) => {
          const active = path === t.href || (t.href !== "/admin" && path.startsWith(`${t.href}/`));
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px block whitespace-nowrap border-b px-4 py-3 text-[14px] transition-colors",
                  active ? "border-gold text-gold-soft" : "border-transparent text-stone hover:text-ivory",
                )}
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
