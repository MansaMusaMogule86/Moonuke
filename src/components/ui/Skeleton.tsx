import { cn } from "@/lib/cn";

/** Loading placeholder: a slow champagne & charcoal shimmer, never a grey flash. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "mk-sheen rounded-md bg-[linear-gradient(100deg,#151116_30%,#261f2a_50%,#151116_70%)] bg-[length:200%_100%]",
        className,
      )}
    />
  );
}
