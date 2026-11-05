import { cn } from "@/lib/cn";

type Stage = { key: string; label: string; optional: boolean };

/**
 * Onboarding progress. Server-safe (no client JS). Optional steps are shown
 * but never block progress.
 */
export function Stepper({ stages, done, current, compact = false }: { stages: readonly Stage[]; done: Record<string, boolean>; current: string; compact?: boolean }) {
  const doneCount = stages.filter((s) => done[s.key]).length;
  return (
    <div>
      <p className="sr-only">
        {doneCount} of {stages.length} onboarding steps complete. Next: {stages.find((s) => s.key === current)?.label}.
      </p>
      <ol aria-hidden className={cn("grid gap-2", compact ? "grid-cols-8" : "grid-cols-2 sm:grid-cols-4 lg:grid-cols-8")}>
        {stages.map((s, i) => {
          const isDone = done[s.key];
          const isCurrent = !isDone && s.key === current;
          return (
            <li key={s.key} className="min-w-0">
              <div className={cn("h-1 rounded-full", isDone ? "bg-gold" : isCurrent ? "bg-gold/40" : "bg-ivory/10")} />
              {!compact && (
                <p className={cn("mt-2 truncate text-[12px]", isDone ? "text-ivory" : isCurrent ? "text-gold-soft" : "text-ash")}>
                  <span className="font-display italic text-gold-muted">{i + 1}</span> {s.label}
                  {s.optional && <span aria-hidden className="text-ash">*</span>}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {!compact && <p className="mt-3 text-[11px] text-ash">* Optional — helpful, never required.</p>}
    </div>
  );
}
