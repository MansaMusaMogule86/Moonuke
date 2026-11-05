"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { cn } from "@/lib/cn";

type Option<T extends string> = { value: T; label: string };

/**
 * Segmented control — a radiogroup with a gliding gold indicator.
 * Arrow keys move between options (native radio behaviour).
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  const name = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex rounded-full border border-line-strong p-1", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <label
            key={o.value}
            className={cn(
              "relative cursor-pointer rounded-full px-4 py-1.5 text-[13px] tracking-[0.04em] transition-colors duration-[260ms]",
              "has-[:focus-visible]:outline has-[:focus-visible]:outline-1 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gold-soft",
              active ? "text-ink" : "text-stone hover:text-ivory",
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={active}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {active && (
              <motion.span
                layoutId={`seg-${name}`}
                className="absolute inset-0 rounded-full bg-gold"
                transition={{ type: "spring", stiffness: 380, damping: 34 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </label>
        );
      })}
    </div>
  );
}
