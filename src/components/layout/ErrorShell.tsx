import Link from "next/link";
import type { ReactNode } from "react";
import { Symbol } from "@/components/brand/Symbol";
import { brand } from "@/config/brand";

/** Quiet, branded frame for 404 and error pages. Never shows stack traces or error messages. */
/** `inShell`: rendered inside a layout that already provides <main id="main">. */
export function ErrorShell({ eyebrow, title, children, inShell = false }: { eyebrow: string; title: ReactNode; children: ReactNode; inShell?: boolean }) {
  const Landmark = inShell ? "div" : "main";
  return (
    <Landmark
      {...(inShell ? {} : { id: "main", tabIndex: -1 })}
      data-testid="error-shell"
      className={`smoke-ambient flex items-center justify-center px-5 outline-none ${inShell ? "min-h-[70svh] py-16" : "min-h-[100svh] py-20"}`}
    >
      <div className="max-w-xl rounded-[var(--radius-xl)] border border-line bg-ink-2/75 p-8 text-center shadow-[0_24px_70px_-24px_rgba(0,0,0,0.85)] md:p-12">
        <Link href="/" className="mx-auto inline-flex rounded-full" aria-label={`${brand.name} home`}>
          <Symbol size={44} />
        </Link>
        <p className="eyebrow mt-8 text-gold">{eyebrow}</p>
        <h1 className="mt-4 font-display text-[40px] leading-[1.02] tracking-[-0.02em] text-ivory md:text-[56px]">{title}</h1>
        <div className="mt-6 space-y-6 text-[15px] leading-relaxed text-stone">{children}</div>
      </div>
    </Landmark>
  );
}
