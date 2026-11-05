import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "vip" | "member" | "locked" | "neutral" | "live";

const tones: Record<Tone, string> = {
  vip: "border-gold/60 text-gold-soft bg-gold/[0.08]",
  member: "border-line-strong text-ivory bg-ivory/[0.04]",
  locked: "border-line-strong text-stone bg-ink/60 backdrop-blur-sm",
  neutral: "border-line text-stone",
  live: "border-danger/50 text-danger bg-danger/[0.08]",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[10.5px] font-medium uppercase tracking-[0.18em]",
        tones[tone],
        className,
      )}
    >
      {tone === "vip" && <span aria-hidden className="h-1 w-1 rounded-full bg-gold-soft shadow-[0_0_8px_#e8cc91]" />}
      {tone === "live" && <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" />}
      {tone === "locked" && <LockGlyph className="h-3 w-3" />}
      {children}
    </span>
  );
}

export function LockGlyph({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={className}>
      <rect x="3.25" y="7" width="9.5" height="7" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
