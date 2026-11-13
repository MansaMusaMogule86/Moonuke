"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export type OwnerNavItem = {
  href: string;
  label: string;
};

export function OwnerNav({ items }: { items: OwnerNavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Owner dashboard navigation" className="-mx-5 overflow-x-auto px-5 md:mx-0 md:px-0">
      <ul className="flex w-max gap-1.5 border-b border-line pb-px md:flex-wrap">
        {items.map((item) => {
          const active =
            item.href === "/owner"
              ? pathname === "/owner"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-3 text-[13px] tracking-[0.04em] transition-colors",
                  active
                    ? "border-[#ff2e93] text-ivory font-medium"
                    : "border-transparent text-stone hover:border-gold/40 hover:text-ivory",
                )}
              >
                {active && (
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-full bg-[#ff2e93] shadow-[0_0_8px_#ff2e93]"
                  />
                )}
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

