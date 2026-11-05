import { cn } from "@/lib/cn";

/** Loading placeholder: a slow champagne shimmer, never a grey flash. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "mk-sheen rounded-md bg-[linear-gradient(100deg,#101010_30%,#1d1b17_50%,#101010_70%)] bg-[length:200%_100%]",
        className,
      )}
    />
  );
}
