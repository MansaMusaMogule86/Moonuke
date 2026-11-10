import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { brand } from "@/config/brand";

const cols = [
  { title: "Explore", links: [["Discover", "/#discover"], ["How it works", "/#how-it-works"], ["Memberships", "/#memberships"], ["FAQ", "/#faq"]] },
  { title: "Creators", links: [["For creators", "/#creators"], ["Privacy and control", "/#privacy"]] },
  { title: "Account", links: [["Sign in", "/signin"], ["Reset password", "/forgot"], ["Report content", "/takedown"]] },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-ink">
      <div className="container-wide grid gap-12 py-16 md:grid-cols-12 md:py-20">
        <div className="md:col-span-4">
          <Logo className="h-24" />
          <p className="mt-6 max-w-xs text-[14px] leading-relaxed text-stone">{brand.tagline}.</p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-10 sm:grid-cols-3 md:col-span-7 md:col-start-6">
          {cols.map((c) => (
            <div key={c.title}>
              <p className="mb-4 text-[13px] font-medium text-ivory">{c.title}</p>
              <ul className="space-y-1">
                {c.links.map(([label, href]) => (
                  <li key={label}>
                    <Link href={href} className="inline-block py-1.5 text-[14px] text-stone transition-colors hover:text-gold-soft">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className="border-t border-line">
        <div className="container-wide flex flex-col gap-2 py-6 text-[13px] text-ash md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} {brand.name}</p>
          <p>Accounts are for people aged 18 and over.</p>
        </div>
      </div>
    </footer>
  );
}
