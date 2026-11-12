import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { Symbol } from "@/components/brand/Symbol";
import { Wordmark } from "@/components/brand/Wordmark";
import { brand } from "@/config/brand";

/**
 * Shell for sign-in, invitation, pending, reset and age-check screens.
 * Desktop: a smoky obsidian & champagne gold brand panel beside the form.
 * Mobile: a compact header with the DF monogram, then the form first.
 */
export function AuthShell({ eyebrow, title, lede, children }: { eyebrow: string; title: ReactNode; lede?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-[100svh] bg-ink lg:grid lg:grid-cols-12">
      <aside className="smoke-cinematic relative hidden overflow-hidden border-r border-line bg-ink-2 lg:col-span-5 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Link href="/" className="relative flex items-center gap-3 self-start rounded-md">
          <span className="sr-only">{`${brand.name} home`}</span>
          <Symbol size={36} />
          <Wordmark decorative tone="duotone" className="text-[16px]" />
        </Link>
        <div className="relative flex flex-col items-center text-center">
          <Logo className="h-52 xl:h-64" sizes="320px" />
          <div aria-hidden className="hairline-pink mt-8 w-40" />
          <p className="mt-6 max-w-xs text-[15px] leading-relaxed text-stone">{brand.tagline}.</p>
        </div>
        <p className="relative text-[13px] text-ash">Joining is by personal invitation.</p>
      </aside>

      <div className="smoke-ambient flex min-h-[100svh] flex-col lg:col-span-7">
        <header className="container-wide flex h-[72px] items-center border-b border-line/60 lg:hidden">
          <Link href="/" className="flex items-center gap-3 rounded-md">
            <span className="sr-only">{`${brand.name} home`}</span>
            <Symbol size={40} />
            <Wordmark decorative tone="duotone" className="text-[16px]" />
          </Link>
        </header>
        <main id="main" className="flex flex-1 flex-col justify-center px-5 pb-16 pt-8 sm:px-10 lg:px-16 lg:py-16 xl:px-24">
          <div className="w-full max-w-md">
            <p className="eyebrow">{eyebrow}</p>
            <h1 className="mt-4 font-display text-[clamp(2.25rem,5vw,3.25rem)] leading-[1.05] tracking-[-0.015em] text-ivory">{title}</h1>
            {lede && <div className="mt-4 text-[16px] leading-relaxed text-stone">{lede}</div>}
            <div className="mt-10">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
