"use client";

import Link from "next/link";
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "gold" | "outline" | "ghost" | "quiet";
type Size = "sm" | "md" | "lg";

const base =
  "group/btn relative inline-flex select-none items-center justify-center gap-2.5 whitespace-nowrap rounded-full font-sans font-medium tracking-[0.04em] " +
  "transition-[background-color,color,border-color,box-shadow,transform] duration-[260ms] ease-lux " +
  "active:scale-[0.97] active:duration-[140ms] disabled:pointer-events-none disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40";

const variants: Record<Variant, string> = {
  gold:
    "bg-gold text-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_10px_30px_-12px_rgb(214_181_109/0.55)] " +
    "hover:bg-gold-soft hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.45),0_16px_44px_-14px_rgb(232_204_145/0.7)]",
  outline:
    "border border-line-strong text-ivory hover:border-gold/70 hover:text-gold-soft bg-transparent",
  ghost: "text-ivory hover:bg-ivory/[0.06]",
  quiet: "text-stone hover:text-ivory",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-[13px]",
  md: "h-11 px-6 text-sm",
  lg: "h-14 px-8 text-[15px]",
};

type Common = {
  variant?: Variant;
  size?: Size;
  /** Trailing arrow that glides on hover. */
  arrow?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
};

type AsButton = Common & Omit<ComponentPropsWithoutRef<"button">, keyof Common> & { href?: undefined };
type AsLink = Common & Omit<ComponentPropsWithoutRef<typeof Link>, keyof Common> & { href: string };

export const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, AsButton | AsLink>(function Button(
  { variant = "gold", size = "md", arrow, loading, icon, className, children, ...rest },
  ref,
) {
  const content = (
    <>
      {loading ? <Spinner /> : icon}
      <span className={cn(loading && "opacity-70")}>{children}</span>
      {arrow && (
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className="h-4 w-4 transition-transform duration-[260ms] ease-lux group-hover/btn:translate-x-1"
        >
          <path d="M3 10h13M11 4.5 16.5 10 11 15.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      )}
    </>
  );
  const classes = cn(base, variants[variant], sizes[size], className);

  if ("href" in rest && rest.href !== undefined) {
    return (
      <Link ref={ref as React.Ref<HTMLAnchorElement>} className={classes} {...(rest as AsLink)}>
        {content}
      </Link>
    );
  }
  const btn = rest as AsButton;
  return (
    <button
      ref={ref as React.Ref<HTMLButtonElement>}
      type={btn.type ?? "button"}
      aria-busy={loading || undefined}
      disabled={btn.disabled || loading}
      className={classes}
      {...btn}
    >
      {content}
    </button>
  );
});

function Spinner() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 animate-spin">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
