import type { ReactNode } from "react";

/**
 * Compact Studio page header: practical sans-serif title, optional eyebrow,
 * a short lede and a right-aligned primary action. Replaces the oversized
 * display headings and per-page back-links the sidebar now covers.
 */
export function StudioHeader({
  title,
  eyebrow,
  lede,
  actions,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow text-gold">{eyebrow}</p>}
        <h1 className="mt-1 text-[26px] font-medium leading-tight tracking-[-0.01em] text-ivory md:text-[30px]">{title}</h1>
        {lede && <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-stone">{lede}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </header>
  );
}
