"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Sheet } from "./Sheet";
import { cn } from "@/lib/cn";

/**
 * LuxuryModal / LuxuryDialog — Accessible modal dialog & bottom sheet.
 * Uses Vaul/Radix dialog primitives via Sheet for focus trapping, Escape to close,
 * and mobile bottom-sheet ergonomics.
 */
export function LuxuryModal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} description={description}>
      {children}
    </Sheet>
  );
}

export const LuxuryDialog = LuxuryModal;

/**
 * LuxuryTabs — Accessible keyboard-navigable tab list (Left/Right/Home/End arrow keys).
 */
export function LuxuryTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: readonly { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (tabs.length === 0) return;
    let next = -1;
    if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next >= 0) {
      e.preventDefault();
      onChange(tabs[next].value);
      refs.current[next]?.focus();
    }
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "inline-flex flex-wrap items-center gap-1 rounded-full border border-line-strong bg-ink-2/90 p-1",
        className,
      )}
    >
      {tabs.map((t, i) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] tracking-[0.04em] transition-colors duration-[260ms]",
              active
                ? "border border-gold/45 bg-gold/[0.12] text-gold-soft shadow-[0_0_18px_-6px_rgb(216_173_82/0.4)]"
                : "border border-transparent text-stone hover:text-ivory",
            )}
          >
            <span>{t.label}</span>
            {t.count != null && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[11px] tabular-nums",
                  active ? "bg-gold/20 text-gold-soft" : "bg-ink-3 text-ash",
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * LuxuryTooltip — Accessible hover and focus tooltip.
 */
export function LuxuryTooltip({
  content,
  children,
  className,
}: {
  content: string;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);

  return (
    <span
      className={cn("relative inline-flex items-center", className)}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setVisible(false);
      }}
      aria-describedby={visible ? id : undefined}
    >
      {children}
      {visible && (
        <span
          id={id}
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-[var(--radius-sm)] border border-gold/35 bg-ink-3 px-3 py-1.5 text-[12px] text-ivory shadow-[var(--mk-shadow-1)]"
        >
          {content}
        </span>
      )}
    </span>
  );
}

/**
 * LuxuryToast — Accessible status or alert banner with optional dismiss action.
 */
export function LuxuryToast({
  tone = "gold",
  title,
  children,
  onDismiss,
  className,
}: {
  tone?: "gold" | "pink" | "danger" | "success";
  title?: string;
  children: ReactNode;
  onDismiss?: () => void;
  className?: string;
}) {
  const styles = {
    gold: "border-gold/40 bg-gold/[0.07] text-gold-soft",
    pink: "border-pink/40 bg-pink/[0.08] text-ivory",
    danger: "border-danger/45 bg-danger/[0.08] text-danger",
    success: "border-success/45 bg-success/[0.08] text-success",
  } as const;

  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-start justify-between gap-4 rounded-[var(--radius-md)] border px-4 py-3 text-[14px] leading-relaxed shadow-[var(--mk-shadow-1)]",
        styles[tone],
        className,
      )}
    >
      <div>
        {title && <p className="font-medium text-ivory">{title}</p>}
        <div>{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="shrink-0 rounded-full p-1 text-stone transition-colors hover:text-ivory"
        >
          <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}

/**
 * LuxuryDropdown — Accessible keyboard-operable dropdown menu.
 */
export function LuxuryDropdown({
  label,
  items,
  className,
}: {
  label: ReactNode;
  items: readonly { label: string; href?: string; onSelect?: () => void; tone?: "default" | "gold" | "danger" }[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative inline-block", className)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 items-center gap-2 rounded-full border border-line-strong bg-ink-2 px-4 text-[13px] text-ivory transition-colors hover:border-gold/60"
      >
        <span>{label}</span>
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className={cn("h-3.5 w-3.5 text-gold transition-transform duration-200", open && "rotate-180")}
        >
          <path d="M3.5 6 8 10.5 12.5 6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <ul
          role="menu"
          className="absolute right-0 z-50 mt-2 min-w-[190px] overflow-hidden rounded-[var(--radius-md)] border border-line-strong bg-ink-3 p-1.5 shadow-[var(--mk-shadow-2)]"
        >
          {items.map((item) => {
            const toneCls =
              item.tone === "danger"
                ? "text-danger hover:bg-danger/10"
                : item.tone === "gold"
                  ? "text-gold-soft hover:bg-gold/10"
                  : "text-ivory hover:bg-ivory/[0.06]";
            return (
              <li key={item.label} role="none">
                {item.href ? (
                  <a
                    role="menuitem"
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn("block rounded-[var(--radius-sm)] px-3 py-2 text-[13.5px] transition-colors", toneCls)}
                  >
                    {item.label}
                  </a>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      item.onSelect?.();
                    }}
                    className={cn(
                      "block w-full rounded-[var(--radius-sm)] px-3 py-2 text-left text-[13.5px] transition-colors",
                      toneCls,
                    )}
                  >
                    {item.label}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

