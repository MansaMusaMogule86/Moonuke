import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type SmokyVariant =
  | "discover"
  | "steps"
  | "memberships"
  | "creators"
  | "privacy"
  | "faq"
  | "closing";

const VARIANT_LIGHTING: Record<SmokyVariant, string> = {
  discover:
    "bg-[radial-gradient(58%_48%_at_16%_18%,rgb(216_173_82/0.13)_0%,transparent_70%),radial-gradient(52%_46%_at_86%_28%,rgb(245_42_139/0.11)_0%,transparent_72%),radial-gradient(75%_60%_at_50%_75%,rgb(52_16_31/0.42)_0%,transparent_80%)]",
  steps:
    "bg-[radial-gradient(60%_50%_at_82%_20%,rgb(216_173_82/0.12)_0%,transparent_70%),radial-gradient(50%_45%_at_18%_65%,rgb(245_42_139/0.10)_0%,transparent_72%),radial-gradient(70%_58%_at_50%_45%,rgb(52_16_31/0.38)_0%,transparent_78%)]",
  memberships:
    "bg-[radial-gradient(55%_48%_at_22%_24%,rgb(245_42_139/0.12)_0%,transparent_70%),radial-gradient(60%_52%_at_78%_58%,rgb(216_173_82/0.14)_0%,transparent_72%),radial-gradient(80%_64%_at_50%_50%,rgb(52_16_31/0.46)_0%,transparent_82%)]",
  creators:
    "bg-[radial-gradient(58%_50%_at_25%_22%,rgb(216_173_82/0.13)_0%,transparent_70%),radial-gradient(54%_48%_at_84%_72%,rgb(245_42_139/0.11)_0%,transparent_70%),radial-gradient(72%_60%_at_50%_35%,rgb(52_16_31/0.40)_0%,transparent_80%)]",
  privacy:
    "bg-[radial-gradient(52%_48%_at_18%_42%,rgb(245_42_139/0.10)_0%,transparent_70%),radial-gradient(56%_50%_at_82%_30%,rgb(216_173_82/0.11)_0%,transparent_72%),radial-gradient(70%_58%_at_50%_60%,rgb(52_16_31/0.36)_0%,transparent_78%)]",
  faq:
    "bg-[radial-gradient(54%_48%_at_20%_25%,rgb(216_173_82/0.11)_0%,transparent_70%),radial-gradient(50%_46%_at_82%_68%,rgb(245_42_139/0.09)_0%,transparent_72%),radial-gradient(75%_60%_at_50%_50%,rgb(52_16_31/0.35)_0%,transparent_80%)]",
  closing:
    "bg-[radial-gradient(65%_55%_at_50%_35%,rgb(216_173_82/0.15)_0%,transparent_68%),radial-gradient(58%_50%_at_50%_68%,rgb(245_42_139/0.14)_0%,transparent_72%),radial-gradient(85%_70%_at_50%_50%,rgb(52_16_31/0.52)_0%,transparent_84%)]",
};

/**
 * LuxuryDivider — Subtle champagne-gold to neon-pink luminous hairline with a central
 * diamond emblem. Connects sections smoothly without harsh horizontal borders.
 */
export function LuxuryDivider({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("relative mx-auto flex max-w-[1280px] items-center justify-center px-6", className)}>
      <div className="h-px w-full bg-[linear-gradient(90deg,transparent_0%,rgb(216_173_82/0.38)_30%,rgb(245_42_139/0.55)_50%,rgb(216_173_82/0.38)_70%,transparent_100%)]" />
      <span className="absolute h-2 w-2 rotate-45 border border-gold/75 bg-ink shadow-[0_0_12px_rgb(245_42_139/0.75)]" />
    </div>
  );
}

/**
 * PinkAccent — Selective neon-pink highlight bar, dot, or diamond.
 */
export function PinkAccent({
  variant = "bar",
  tone = "pink",
  className,
}: {
  variant?: "bar" | "dot" | "diamond";
  tone?: "pink" | "gold";
  className?: string;
}) {
  if (variant === "dot") {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "inline-block h-2 w-2 shrink-0 rounded-full",
          tone === "pink"
            ? "bg-pink shadow-[0_0_10px_rgb(245_42_139/0.8)]"
            : "bg-gold shadow-[0_0_10px_rgb(216_173_82/0.7)]",
          className,
        )}
      />
    );
  }
  if (variant === "diamond") {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "inline-block h-2 w-2 shrink-0 rotate-45",
          tone === "pink"
            ? "bg-pink shadow-[0_0_10px_rgb(245_42_139/0.8)]"
            : "bg-gold shadow-[0_0_10px_rgb(216_173_82/0.7)]",
          className,
        )}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "block h-[3px] w-9 rounded-full",
        tone === "pink"
          ? "bg-[linear-gradient(90deg,#f52a8b_0%,#ff8bc8_75%,transparent_100%)] shadow-[0_0_12px_rgb(245_42_139/0.6)]"
          : "bg-[linear-gradient(90deg,#d8ad52_0%,#f3d58a_75%,transparent_100%)] shadow-[0_0_12px_rgb(216_173_82/0.5)]",
        className,
      )}
    />
  );
}

/**
 * GoldGlowCard — Translucent dark luxury glass card with champagne-gold hairline,
 * smoky internal depth, top specular edge, and controlled hover/focus illumination.
 */
export function GoldGlowCard({
  as: Tag = "div",
  accent = "gold",
  interactive = true,
  className,
  children,
}: {
  as?: "div" | "li" | "article";
  accent?: "gold" | "pink" | "vip";
  interactive?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag
      className={cn(
        "group relative overflow-hidden rounded-[var(--radius-xl)] border bg-[linear-gradient(155deg,rgb(26_20_29/0.88)_0%,rgb(12_10_14/0.95)_58%,rgb(42_15_29/0.52)_100%)] shadow-[inset_0_1px_0_rgb(243_213_138/0.20),0_22px_50px_-24px_rgba(0,0,0,0.92)] transition-all duration-[280ms]",
        accent === "vip"
          ? "border-gold/55 shadow-[inset_0_1px_0_rgb(243_213_138/0.35),0_24px_60px_-20px_rgba(216,173,82,0.22),0_0_36px_-14px_rgba(245,42,139,0.2)]"
          : accent === "pink"
            ? "border-gold/30 hover:border-pink/55"
            : "border-gold/30",
        interactive &&
          "hover:-translate-y-0.5 hover:border-gold/65 hover:shadow-[inset_0_1px_0_rgb(243_213_138/0.38),0_28px_64px_-20px_rgba(216,173,82,0.24),0_0_32px_-12px_rgba(245,42,139,0.18)]",
        className,
      )}
    >
      {/* Top champagne-to-pink specular rim */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-6 top-0 h-px opacity-75 transition-opacity duration-[280ms] group-hover:opacity-100",
          accent === "pink"
            ? "bg-[linear-gradient(90deg,transparent_0%,rgb(245_42_139/0.65)_50%,transparent_100%)]"
            : "bg-[linear-gradient(90deg,transparent_0%,rgb(243_213_138/0.65)_50%,transparent_100%)]",
        )}
      />
      {/* Subtle internal corner glow */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full opacity-55 transition-opacity duration-[280ms] group-hover:opacity-90",
          accent === "pink"
            ? "bg-[radial-gradient(closest-side,rgb(245_42_139/0.16),transparent)]"
            : "bg-[radial-gradient(closest-side,rgb(216_173_82/0.15),transparent)]",
        )}
      />
      <div className="relative z-10 h-full">{children}</div>
    </Tag>
  );
}

/**
 * SmokySection — Continuous obsidian/charcoal/burgundy atmospheric canvas with
 * soft gold & pink radial lighting, subtle smoky SVG wisps, and luminous curves
 * that visually connect every homepage section to the approved hero.
 */
export function SmokySection({
  id,
  ariaLabelledBy,
  variant = "discover",
  divider = true,
  curve = "none",
  className,
  children,
}: {
  id?: string;
  ariaLabelledBy: string;
  variant?: SmokyVariant;
  divider?: boolean;
  curve?: "none" | "left" | "right" | "arc";
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={ariaLabelledBy}
      className={cn("relative isolate overflow-hidden bg-ink section-y", className)}
    >
      {divider && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10">
          <LuxuryDivider />
        </div>
      )}

      {/* Radial lighting + charcoal/burgundy haze */}
      <div
        aria-hidden="true"
        className={cn("pointer-events-none absolute inset-0 -z-20", VARIANT_LIGHTING[variant])}
      />

      {/* Soft charcoal smoke plumes (SVG radial clouds, zero external image requests) */}
      <svg
        aria-hidden="true"
        viewBox="0 0 1440 720"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-75"
      >
        <defs>
          <radialGradient id={`smoke-a-${variant}`} cx="24%" cy="32%" r="44%">
            <stop offset="0%" stopColor="#261d29" stopOpacity="0.55" />
            <stop offset="55%" stopColor="#151116" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#080709" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`smoke-b-${variant}`} cx="78%" cy="64%" r="46%">
            <stop offset="0%" stopColor="#34101f" stopOpacity="0.42" />
            <stop offset="55%" stopColor="#1b131d" stopOpacity="0.20" />
            <stop offset="100%" stopColor="#080709" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`wave-gold-${variant}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#D8AD52" stopOpacity="0" />
            <stop offset="35%" stopColor="#F3D58A" stopOpacity="0.38" />
            <stop offset="70%" stopColor="#F52A8B" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#F52A8B" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect width="1440" height="720" fill={`url(#smoke-a-${variant})`} />
        <rect width="1440" height="720" fill={`url(#smoke-b-${variant})`} />
        {curve === "left" && (
          <path
            d="M-80 580 C 260 440, 620 660, 1120 490 C 1280 435, 1390 450, 1520 510"
            fill="none"
            stroke={`url(#wave-gold-${variant})`}
            strokeWidth="1.5"
          />
        )}
        {curve === "right" && (
          <path
            d="M-60 160 C 320 290, 780 90, 1220 240 C 1350 285, 1430 260, 1520 210"
            fill="none"
            stroke={`url(#wave-gold-${variant})`}
            strokeWidth="1.5"
          />
        )}
        {curve === "arc" && (
          <>
            <path
              d="M-40 520 C 360 370, 820 620, 1480 410"
              fill="none"
              stroke={`url(#wave-gold-${variant})`}
              strokeWidth="1.6"
            />
            <path
              d="M120 610 C 520 470, 960 650, 1500 490"
              fill="none"
              stroke={`url(#wave-gold-${variant})`}
              strokeWidth="1"
              opacity="0.65"
            />
          </>
        )}
      </svg>

      {/* Top and bottom vertical feathering so adjacent sections blend seamlessly into #080709 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-24 bg-gradient-to-b from-ink to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-24 bg-gradient-to-t from-ink to-transparent"
      />

      {children}
    </section>
  );
}

/**
 * AtmosphericCTA — Flagship closing panel echoing the Hero's circular gold/pink neon
 * aura and luminous waves.
 */
export function AtmosphericCTA({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mk-reveal relative isolate overflow-hidden rounded-[var(--radius-xl)] border border-gold/45 bg-[linear-gradient(145deg,#171119_0%,#0b090d_52%,#260e19_100%)] px-6 py-14 text-center shadow-[inset_0_1px_0_rgb(243_213_138/0.35),0_32px_80px_-24px_rgba(0,0,0,0.95),0_0_60px_-20px_rgba(245,42,139,0.22)] md:px-14 md:py-20",
        className,
      )}
    >
      {/* Ambient gold & neon pink radial glows */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 -top-24 -z-10 h-80 w-80 rounded-full bg-[radial-gradient(closest-side,rgb(216_173_82/0.20),transparent)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -right-24 -z-10 h-80 w-80 rounded-full bg-[radial-gradient(closest-side,rgb(245_42_139/0.20),transparent)]"
      />

      {/* Decorative gold/pink halo & wave echoing the Hero artwork */}
      <svg
        aria-hidden="true"
        viewBox="0 0 800 360"
        fill="none"
        className="pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-80"
      >
        <defs>
          <linearGradient id="cta-halo" x1="180" y1="20" x2="620" y2="340" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#F3D58A" stopOpacity="0.42" />
            <stop offset="50%" stopColor="#D8AD52" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#F52A8B" stopOpacity="0.45" />
          </linearGradient>
          <linearGradient id="cta-wave" x1="0" y1="300" x2="800" y2="280" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#D8AD52" stopOpacity="0" />
            <stop offset="35%" stopColor="#D8AD52" stopOpacity="0.45" />
            <stop offset="70%" stopColor="#F52A8B" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#F52A8B" stopOpacity="0" />
          </linearGradient>
        </defs>
        <circle cx="400" cy="180" r="155" stroke="url(#cta-halo)" strokeWidth="1.2" />
        <path
          d="M-40 315 C 210 255, 510 355, 840 265"
          stroke="url(#cta-wave)"
          strokeWidth="1.6"
        />
      </svg>

      {children}
    </div>
  );
}
