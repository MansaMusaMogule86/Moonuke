"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Symbol } from "@/components/brand/Symbol";
import { Wordmark } from "@/components/brand/Wordmark";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { brand } from "@/config/brand";
import { cn } from "@/lib/cn";

/**
 * Public navigation. "Creators" opens the real directory, which asks visitors
 * to sign in. There is no pricing page (each creator sets prices), so none is
 * linked. Old homepage anchors (#circle, #tiers, #vault) still resolve.
 */
export const NAV = [
  { href: "/#discover", label: "Discover" },
  { href: "/discover", label: "Creators" },
  { href: "/#creators", label: "For Creators" },
  { href: "/#features", label: "Features" },
] as const;

/** Joining is invitation-only: this explains how, it never creates an account. */
export const JOIN_HREF = "/#how-it-works";

export function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  const [solid, setSolid] = useState(!overlay);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!overlay) return;
    const onScroll = () => setSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [overlay]);

  return (
    <>
      <header
        className={cn(
          "inset-x-0 top-0 z-50 transition-[background-color] duration-[520ms]",
          overlay ? "fixed" : "sticky",
          solid ? "border-b border-line bg-ink/85 backdrop-blur-md" : "bg-gradient-to-b from-ink/70 to-transparent",
        )}
      >
        <div className="container-wide flex h-[72px] items-center justify-between gap-4 lg:h-[84px]">
          <Link href="/" className="flex items-center gap-3 rounded-md">
            <span className="sr-only">{`${brand.name} home`}</span>
            <Symbol size={44} className="h-10 w-10 lg:h-11 lg:w-11" />
            <Wordmark decorative className="text-[14px] sm:text-[16px]" />
          </Link>

          <nav aria-label="Primary" className="hidden lg:block">
            <ul className="flex items-center gap-1">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="relative block rounded-full px-4 py-2.5 text-[14px] text-ivory/80 transition-colors duration-[260ms] after:absolute after:inset-x-4 after:bottom-1.5 after:h-px after:origin-left after:scale-x-0 after:bg-gold after:transition-transform after:duration-[260ms] hover:text-ivory hover:after:scale-x-100"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex items-center gap-2">
            <Button href="/signin" size="sm" variant="outline" className="hidden h-11 px-5 sm:inline-flex">
              Log in
            </Button>
            <Button href={JOIN_HREF} size="sm" className="hidden h-11 px-5 md:inline-flex">
              {`Join ${brand.name}`}
            </Button>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              aria-haspopup="dialog"
              aria-expanded={open}
              className="grid h-11 w-11 place-items-center rounded-full border border-line-strong text-ivory transition-colors hover:border-gold/60 lg:hidden"
            >
              <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4">
                <path d="M3 6.5h14M3 13.5h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <Sheet open={open} onOpenChange={setOpen} title={brand.name} description={brand.descriptor}>
        <nav aria-label="Mobile">
          <ul className="divide-y divide-line">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-14 items-center justify-between text-[18px] text-ivory transition-colors active:text-gold"
                >
                  {item.label}
                  <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 text-ash">
                    <path d="M7 4l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-6 grid gap-3 pb-2">
          <Button href={JOIN_HREF} className="w-full" onClick={() => setOpen(false)}>
            {`Join ${brand.name}`}
          </Button>
          <Button href="/signin" variant="outline" className="w-full" onClick={() => setOpen(false)}>
            Log in
          </Button>
          <p className="text-center text-[13px] text-ash">Joining is by personal invitation.</p>
        </div>
      </Sheet>
    </>
  );
}
