import Link from "next/link";
import { Portrait, type PortraitStudy } from "@/components/ui/Portrait";

/** Compact creator link: placeholder portrait + name. */
export function CreatorChip({ c, sub }: { c: { handle: string; displayName: string; discipline?: string; cover: PortraitStudy }; sub?: string }) {
  return (
    <Link href={`/c/${c.handle}`} className="group flex min-w-0 items-center gap-3 rounded-[var(--radius-md)]">
      <Portrait alt="" study={c.cover} className="h-12 w-12 shrink-0 rounded-full border border-line" />
      <span className="min-w-0">
        <span className="block truncate text-[15px] text-ivory group-hover:text-gold-soft">{c.displayName}</span>
        <span className="block truncate text-[12px] text-ash">{sub ?? c.discipline}</span>
      </span>
    </Link>
  );
}
