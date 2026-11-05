"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export function AccountTabs({ showPrivacy }: { showPrivacy: boolean }) {
  const path = usePathname();
  const tabs = [{ href: "/account/security", label: "Security" }, ...(showPrivacy ? [{ href: "/account/privacy", label: "Privacy & safety" }] : [])];
  return (
    <nav aria-label="Account sections">
      <ul className="flex gap-1 border-b border-line">
        {tabs.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              aria-current={path === t.href ? "page" : undefined}
              className={cn("-mb-px block border-b px-4 py-3 text-[14px]", path === t.href ? "border-gold text-gold-soft" : "border-transparent text-stone hover:text-ivory")}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
