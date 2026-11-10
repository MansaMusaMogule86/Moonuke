import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { Symbol } from "@/components/brand/Symbol";
import { Wordmark } from "@/components/brand/Wordmark";
import { brand } from "@/config/brand";

/**
 * Shell for sign-in, invitation, pending, reset and age-check screens.
 * Desktop: a quiet brand panel with the full logo beside the form. Mobile: a
 * compact header, then the form first.
 */
export function AuthShell({ eyebrow, title, lede, children }: { eyebrow: string; title: ReactNode; lede?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-[100svh] lg:grid lg:grid-cols-12">
      <aside className="relative hidden overflow-hidden border-r border-line bg-ink-2 lg:col-span-5 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_45%,rgb(216_184_107/0.07),transparent_70%),radial-gradient(40%_30%_at_70%_70%,rgb(255_60_172/0.06),transparent_70%)]" />
        <Link href="/" className="relative self-start rounded-md">
          <span className="sr-only">{`${brand.name} home`}</span>
          <Wordmark decorative className="text-[14px]" />
        </Link>
        <div className="relative flex flex-col items-center text-center">
          <Logo className="h-52 xl:h-64" sizes="320px" />
          <p className="mt-8 max-w-xs text-[15px] leading-relaxed text-stone">{brand.tagline}.</p>
        </div>
        <p className="relative text-[13px] text-ash">Joining is by personal invitation.</p>
      </aside>

      <div className="flex min-h-[100svh] flex-col lg:col-span-7">
        <header className="container-wide flex h-[72px] items-center lg:hidden">
          <Link href="/" className="flex items-center gap-3 rounded-md">
            <span className="sr-only">{`${brand.name} home`}</span>
            <Symbol size={40} />
            <Wordmark decorative className="text-[14px]" />
          </Link>
        </header>
        <main id="main" className="flex flex-1 flex-col justify-center px-5 pb-16 pt-6 sm:px-10 lg:px-16 lg:py-16 xl:px-24">
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
