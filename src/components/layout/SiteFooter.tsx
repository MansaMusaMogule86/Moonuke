import { brand } from "@/config/brand";
import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";

const cols = [
  { title: "Club", links: [["The Circle", "/#circle"], ["Membership", "/#tiers"], ["The Vault", "/#vault"]] },
  { title: "Creators", links: [["For creators", "/#creators"], ["Sign in", "/signin"], ["How entry works", "/#privacy"]] },
  { title: "Trust", links: [["Privacy", "/#privacy"], ["Safety & reporting", "/#privacy"], ["Report content", "/takedown"], ["Design system", "/design-system"]] },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-ink">
      <div className="mx-auto grid max-w-[1600px] gap-14 px-5 py-20 md:grid-cols-12 md:px-10">
        <div className="md:col-span-5">
          <Wordmark withSymbol className="text-[18px]" />
          <p className="mt-6 max-w-sm text-[14px] leading-relaxed text-stone">
            A private club for creators and the people who follow them closely.
          </p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-10 sm:grid-cols-3 md:col-span-6 md:col-start-7">
          {cols.map((c) => (
            <div key={c.title}>
              <p className="eyebrow mb-5 text-stone">{c.title}</p>
              <ul className="space-y-3">
                {c.links.map(([label, href]) => (
                  <li key={label}>
                    <Link href={href} className="text-[14px] text-ivory/85 transition-colors hover:text-gold-soft">
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
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-5 py-6 text-[12px] text-ash md:flex-row md:items-center md:justify-between md:px-10">
          <p>© {new Date().getFullYear()} {brand.name}. Adults 18+ only. Age-restricted content is available only to verified members.</p>
          <p>This public site contains no age-restricted media.</p>
        </div>
      </div>
    </footer>
  );
}
