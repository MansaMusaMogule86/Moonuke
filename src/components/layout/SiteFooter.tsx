import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { Wordmark } from "@/components/brand/Wordmark";
import { brand } from "@/config/brand";

const cols = [
  { title: "Explore", links: [["Discover", "/discover"], ["Creators", "/#discover"], ["For Creators", "/#creators"], ["Features", "/#how-it-works"], ["FAQ", "/#faq"]] },
  { title: "Creators", links: [["Join as a Creator", "/#creators"], ["Privacy and control", "/#privacy"]] },
  { title: "Account", links: [["Log in", "/signin"], ["Reset password", "/forgot"], ["Report content", "/takedown"]] },
] as const;

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-line bg-ink">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/35 to-transparent"
      />
      <div className="container-wide relative grid gap-12 py-16 md:grid-cols-12 md:py-20">
        <div className="md:col-span-4">
          <Logo className="h-24" />
          <div className="mt-4">
            <Wordmark tone="duotone" className="text-[16px]" />
          </div>
          <p className="mt-4 max-w-xs text-[14px] leading-relaxed text-stone">{brand.tagline}.</p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-10 sm:grid-cols-3 md:col-span-7 md:col-start-6">
          {cols.map((c) => (
            <div key={c.title}>
              <p className="mb-4 text-[12px] font-medium uppercase tracking-[0.2em] text-gold-soft">{c.title}</p>
              <ul className="space-y-1">
                {c.links.map(([label, href]) => (
                  <li key={label}>
                    <Link href={href} className="inline-block py-1.5 text-[14px] text-stone transition-colors hover:text-ivory">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className="border-t border-line bg-ink-2/35">
        <div className="container-wide flex flex-col gap-2 py-6 text-[13px] text-ash md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} {brand.name}</p>
          <p>Accounts are for people aged 18 and over.</p>
        </div>
      </div>
    </footer>
  );
}
