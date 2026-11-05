import { Skeleton } from "@/components/ui/Skeleton";

/** Route-level loading state: announced once to screen readers, shimmer respects reduced motion via .mk-sheen. */
export function PageLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="mx-auto max-w-[1100px] px-5 pb-28 pt-14 md:px-10 md:pt-20" role="status" aria-live="polite">
      <span className="sr-only">{label}…</span>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-6 h-14 w-2/3 max-w-[520px]" />
      <Skeleton className="mt-5 h-4 w-full max-w-[640px]" />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-40 rounded-[var(--radius-xl)]" />
        ))}
      </div>
    </div>
  );
}
