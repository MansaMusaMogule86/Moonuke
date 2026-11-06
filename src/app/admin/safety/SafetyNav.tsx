import Link from "next/link";
import { cn } from "@/lib/cn";

const items = [
  { key: "takedowns", href: "/admin/safety", label: "Takedown notices" },
  { key: "review", href: "/admin/safety/review", label: "Review queue" },
  { key: "participants", href: "/admin/safety/participants", label: "Participants" },
  { key: "safeguarding", href: "/admin/safety/safeguarding", label: "Safeguarding" },
] as const;

export function SafetyNav({ current, counts }: { current: (typeof items)[number]["key"]; counts?: Partial<Record<(typeof items)[number]["key"], number>> }) {
  return (
    <nav aria-label="Safety sections" className="mt-6">
      <ul className="flex flex-wrap gap-2">
        {items.map((i) => (
          <li key={i.key}>
            <Link
              href={i.href}
              aria-current={current === i.key ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-full border px-4 text-[13px] transition-colors",
                current === i.key ? "border-gold/60 text-gold-soft" : "border-line text-stone hover:text-ivory",
              )}
            >
              {i.label}
              {counts?.[i.key] ? <span className="text-ivory">{counts[i.key]}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export const when = (d: Date | string) => new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";
export const label = (s: string) => s.replace(/_/g, " ");
