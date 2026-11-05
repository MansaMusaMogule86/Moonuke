"use client";

import Link from "next/link";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { useEffect, useState } from "react";
import { Symbol } from "@/components/brand/Symbol";
import { Wordmark } from "@/components/brand/Wordmark";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/cn";
import { ease } from "@/lib/tokens";

export const NAV = [
  { href: "/#circle", label: "The Circle" },
  { href: "/#tiers", label: "Membership" },
  { href: "/#vault", label: "The Vault" },
  { href: "/#privacy", label: "Privacy" },
  { href: "/#creators", label: "For Creators" },
] as const;

export function SiteHeader() {
  const { scrollY } = useScroll();
  const [hidden, setHidden] = useState(false);
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  useMotionValueEvent(scrollY, "change", (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    setSolid(y > 24);
    setHidden(y > 420 && y > prev && !open);
  });

  // Highlight the section in view.
  useEffect(() => {
    const ids = NAV.map((n) => n.href.replace("/#", ""));
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (vis) setActive(`/#${vis.target.id}`);
      },
      { rootMargin: "-40% 0px -50% 0px", threshold: [0, 0.25, 0.5] },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <>
      <motion.header
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: hidden ? -96 : 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: ease.out }}
        className="fixed inset-x-0 top-0 z-50"
      >
        <div
          className={cn(
            "mx-auto flex h-[72px] max-w-[1600px] items-center justify-between gap-6 px-5 transition-colors duration-[520ms] md:px-10",
          )}
        >
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-ink via-ink/85 to-transparent transition-opacity duration-[520ms]",
              solid ? "opacity-100" : "opacity-0",
            )}
          />
          <Link href="/" className="flex items-center gap-3 rounded-md">
            <span className="sr-only">Moonuke home</span>
            <Symbol size={30} />
            <Wordmark decorative className="hidden text-[15px] sm:inline-flex" />
          </Link>

          <nav aria-label="Primary" className="hidden lg:block">
            <ul className="flex items-center gap-1 rounded-full border border-line-strong bg-ink/40 p-1 backdrop-blur-md">
              {NAV.map((item) => {
                const isActive = active === item.href;
                return (
                  <li key={item.href} className="relative">
                    {isActive && (
                      <motion.span
                        layoutId="nav-pill"
                        className="absolute inset-0 rounded-full border border-gold/40 bg-gold/[0.08]"
                        transition={{ type: "spring", stiffness: 380, damping: 34 }}
                      />
                    )}
                    <a
                      href={item.href}
                      aria-current={isActive ? "true" : undefined}
                      className={cn(
                        "relative block rounded-full px-4 py-2 text-[13px] tracking-[0.04em] transition-colors duration-[260ms]",
                        isActive ? "text-gold-soft" : "text-stone hover:text-ivory",
                      )}
                    >
                      {item.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="flex items-center gap-2">
            <span className="hidden text-[12px] uppercase tracking-[0.2em] text-ash xl:inline">By invitation</span>
            <Button href="/signin" size="sm" className="hidden sm:inline-flex">
              Sign in
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
                <path d="M3 7h14M7 13h10" stroke="currentColor" strokeWidth="1.3" />
              </svg>
            </button>
          </div>
        </div>
      </motion.header>

      <Sheet open={open} onOpenChange={setOpen} title="Moonuke" description="A private creator club. Adults only.">
        <nav aria-label="Mobile">
          <ul className="divide-y divide-line">
            {NAV.map((item, i) => (
              <motion.li
                key={item.href}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: ease.out, delay: 0.08 + i * 0.05 }}
              >
                <a
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between py-4 font-display text-[26px] italic text-ivory transition-colors active:text-gold"
                >
                  {item.label}
                  <span aria-hidden className="text-[12px] not-italic tracking-[0.2em] text-ash">
                    0{i + 1}
                  </span>
                </a>
              </motion.li>
            ))}
          </ul>
        </nav>
        <div className="mt-6 pb-2">
          <Button href="/signin" className="w-full" onClick={() => setOpen(false)}>
            Sign in
          </Button>
          <p className="mt-3 text-center text-[13px] text-ash">Membership is by invitation only.</p>
        </div>
      </Sheet>
    </>
  );
}
