import type { ReactNode } from "react";
import { LibraryNav } from "./LibraryNav";

export function LibraryHeader({ title, intro, children }: { title: ReactNode; intro?: ReactNode; children?: ReactNode }) {
  return (
    <header>
      <p className="eyebrow mb-5">Library</p>
      <h1 className="font-display text-[48px] leading-[0.98] tracking-[-0.03em] text-ivory md:text-[76px]">{title}</h1>
      {intro && <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-stone">{intro}</p>}
      <div className="mt-8"><LibraryNav /></div>
      {children}
    </header>
  );
}
