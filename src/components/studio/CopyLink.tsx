"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

/** Copies a URL to the clipboard. No secret is ever placed on the clipboard. */
export function CopyLink({ url, label = "Copy link", className }: { url: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* clipboard unavailable; the link is still visible and selectable */
        }
      }}
      aria-live="polite"
      className={cn(
        "inline-flex h-9 items-center rounded-full border border-line-strong px-4 text-[13px] text-ivory transition-colors hover:border-gold/60",
        className,
      )}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
