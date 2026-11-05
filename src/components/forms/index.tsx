"use client";

import { useFormStatus } from "react-dom";
import { useId, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { FormState } from "@/lib/forms";

/** Submit button that shows the loading state while its form's action runs. */
export function Submit({ children, variant = "gold", className, name, value }: { children: ReactNode; variant?: "gold" | "outline" | "ghost" | "quiet"; className?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} variant={variant} className={className} name={name} value={value}>
      {children}
    </Button>
  );
}

/** Form-level message. Errors are announced assertively, successes politely. */
export function FormMessage({ state, className }: { state: FormState; className?: string }) {
  if (state.status === "idle" || !state.message) return null;
  const error = state.status === "error";
  return (
    <p
      role={error ? "alert" : "status"}
      className={cn(
        "rounded-[var(--radius-md)] border px-4 py-3 text-[14px] leading-relaxed",
        error ? "border-danger/40 bg-danger/[0.06] text-danger" : "border-gold/35 bg-gold/[0.06] text-gold-soft",
        className,
      )}
    >
      {state.message}
    </p>
  );
}

export function TextArea({ label, error, hint, className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: string }) {
  const id = useId();
  const described = error ? `${id}-e` : hint ? `${id}-h` : undefined;
  return (
    <div className={cn("group/field", className)}>
      <label htmlFor={id} className="eyebrow mb-2 block text-stone group-focus-within/field:text-gold">{label}</label>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={described}
        className={cn(
          "w-full resize-y rounded-[var(--radius-md)] border bg-ink/40 px-4 py-3 text-[16px] text-ivory placeholder:text-ash outline-none transition-colors duration-[260ms]",
          error ? "border-danger" : "border-line-strong focus:border-gold",
        )}
        {...props}
      />
      {error ? <p id={`${id}-e`} role="alert" className="mt-2 text-[13px] text-danger">{error}</p> : hint ? <p id={`${id}-h`} className="mt-2 text-[13px] text-ash">{hint}</p> : null}
    </div>
  );
}

export function Select({ label, error, children, className, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string }) {
  const id = useId();
  return (
    <div className={cn("group/field", className)}>
      <label htmlFor={id} className="eyebrow mb-2 block text-stone group-focus-within/field:text-gold">{label}</label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        className={cn(
          "h-12 w-full appearance-none rounded-[var(--radius-md)] border bg-ink-2 bg-[length:12px] bg-[right_1rem_center] bg-no-repeat px-4 pr-10 text-[15px] text-ivory outline-none transition-colors",
          "bg-[url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'><path d='M1 1l5 5 5-5' fill='none' stroke='%23AAA39A' stroke-width='1.4'/></svg>\")]",
          error ? "border-danger" : "border-line-strong focus:border-gold",
        )}
        {...props}
      >
        {children}
      </select>
      {error && <p role="alert" className="mt-2 text-[13px] text-danger">{error}</p>}
    </div>
  );
}

export function Check({ name, children, error }: { name: string; children: ReactNode; error?: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3 text-[14px] leading-relaxed text-ivory/90">
        <input
          id={id}
          name={name}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-e` : undefined}
          className="peer mt-1 h-5 w-5 shrink-0 cursor-pointer appearance-none rounded-[5px] border border-line-strong bg-ink transition-colors checked:border-gold checked:bg-gold focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-gold-soft"
        />
        <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none -ml-8 mt-1 h-5 w-5 shrink-0 p-0.5 text-ink opacity-0 peer-checked:opacity-100">
          <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
        <span className="pl-0">{children}</span>
      </label>
      {error && <p id={`${id}-e`} role="alert" className="mt-2 pl-8 text-[13px] text-danger">{error}</p>}
    </div>
  );
}
