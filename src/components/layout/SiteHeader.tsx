"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Symbol } from "@/components/brand/Symbol";
import { Wordmark } from "@/components/brand/Wordmark";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { brand } from "@/config/brand";
import { cn } from "@/lib/cn";

/** Homepage sections. Old anchors (#circle, #tiers, #vault) still resolve on the page. */
export const NAV = [
  { href: "/#discover", label: "Discover" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#creators", label: "For creators" },
  { href: "/#faq", label: "FAQ" },
] as const;

export function SiteHeader() {
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-50 border-b transition-colors duration-[260ms]",
          solid ? "border-line bg-ink/90 backdrop-blur-md" : "border-transparent bg-ink",
        )}
      >
        <div className="container-wide flex h-[72px] items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-3 rounded-md">
            <span className="sr-only">{`${brand.name} home`}</span>
            <Symbol size={40} />
            <Wordmark decorative className="text-[14px] sm:text-[15px]" />
          </Link>

          <nav aria-label="Primary" className="hidden lg:block">
            <ul className="flex items-center gap-1">
              {NAV.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="block rounded-full px-4 py-2.5 text-[14px] text-stone transition-colors duration-[260ms] hover:bg-ivory/[0.05] hover:text-ivory"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex items-center gap-2">
            <Button href="/signin" size="sm" className="hidden sm:inline-flex">
              Sign in
            </Button>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              aria-haspopup="dialog"
              aria-expanded={open}
              className="grid h-11 w-11 place-items-center rounded-full border border-line-strong text-ivory transition-colors hover:border-ivory/40 lg:hidden"
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
                <a
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-14 items-center justify-between text-[18px] text-ivory transition-colors active:text-gold"
                >
                  {item.label}
                  <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 text-ash">
                    <path d="M7 4l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-6 pb-2">
          <Button href="/signin" className="w-full" onClick={() => setOpen(false)}>
            Sign in
          </Button>
          <p className="mt-3 text-center text-[13px] text-ash">New members join with a personal invitation.</p>
        </div>
      </Sheet>
    </>
  );
}
