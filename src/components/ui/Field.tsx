import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
};

/** Underline field — the quietest possible input, lit gold on focus. */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, className, id, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined;
  return (
    <div className={cn("group/field relative", className)}>
      <label htmlFor={inputId} className="eyebrow mb-2 block text-stone group-focus-within/field:text-gold">
        {label}
      </label>
      <div className="relative">
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "peer w-full border-0 border-b bg-transparent pb-3 pt-1 text-[17px] text-ivory placeholder:text-ash",
          "outline-none transition-colors duration-[260ms] focus-visible:outline-none",
          error ? "border-danger" : "border-line-strong focus:border-gold",
        )}
        {...props}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 h-px w-full origin-left scale-x-0 bg-gold-soft transition-transform duration-[520ms] ease-lux peer-focus:scale-x-100"
      />
      </div>
      {error ? (
        <p id={`${inputId}-err`} role="alert" className="mt-2 text-[13px] text-danger">{error}</p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-2 text-[13px] text-ash">{hint}</p>
      ) : null}
    </div>
  );
});
