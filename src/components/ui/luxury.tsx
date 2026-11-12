import Link from "next/link";
import type { ReactNode } from "react";
import { Symbol } from "@/components/brand/Symbol";
import { CreatorPlate } from "@/components/club/CreatorPlate";
import { PostTile } from "@/components/club/PostTile";
import { Select, TextArea } from "@/components/forms";
import { SectionHeading } from "@/components/home/SectionHeading";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { StudioHeader } from "@/components/studio/StudioHeader";
import { StudioShell } from "@/components/studio/StudioShell";
import { cn } from "@/lib/cn";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Field } from "./Field";
import { Portrait, type PortraitStudy } from "./Portrait";
import { Skeleton } from "./Skeleton";
import {
  LuxuryDialog,
  LuxuryDropdown,
  LuxuryModal,
  LuxuryTabs,
  LuxuryToast,
  LuxuryTooltip,
} from "./luxury-client";

/**
 * PHASE 3 — DivaFans Global Smoky Luxury Component Library.
 * Reuses existing accessible primitives and provides unified Luxury* components
 * across public pages, Creator Studio, Vault, and Fan Platform.
 */
export const LuxuryButton = Button;
export const LuxuryInput = Field;
export const LuxuryTextarea = TextArea;
export const LuxurySelect = Select;
export const LuxuryBadge = Badge;
export const LuxurySkeleton = Skeleton;
export const LuxurySidebar = StudioShell;
export const LuxuryNavbar = SiteHeader;
export const LuxuryFooter = SiteFooter;
export const LuxuryPageHeader = StudioHeader;
export const LuxurySectionHeader = SectionHeading;
export const LuxuryMediaCard = PostTile;
export const LuxuryCreatorCard = CreatorPlate;

export {
  LuxuryModal,
  LuxuryDialog,
  LuxuryTabs,
  LuxuryTooltip,
  LuxuryToast,
  LuxuryDropdown,
};

/**
 * LuxuryCard — Surface card supporting the 3 controlled smoky effect levels
 * ("minimal", "ambient", "cinematic") and selective gold/pink borders.
 */
export function LuxuryCard({
  children,
  smoke = "minimal",
  accent = "none",
  className,
}: {
  children: ReactNode;
  smoke?: "minimal" | "ambient" | "cinematic";
  accent?: "none" | "gold" | "pink";
  className?: string;
}) {
  const smokeCls =
    smoke === "cinematic"
      ? "smoke-cinematic bg-ink-2"
      : smoke === "ambient"
        ? "smoke-ambient bg-ink-2"
        : "smoke-minimal bg-ink-2";
  const borderCls =
    accent === "gold"
      ? "border-gold/40 shadow-[var(--mk-shadow-1)]"
      : accent === "pink"
        ? "border-pink/40 shadow-[var(--mk-shadow-1)]"
        : "border-line";

  return (
    <div className={cn("rounded-[var(--radius-xl)] border p-6 md:p-8", smokeCls, borderCls, className)}>
      {children}
    </div>
  );
}

/**
 * LuxuryEmptyState — Branded empty state with the DF monogram, editorial heading,
 * supporting copy, and optional primary action.
 */
export function LuxuryEmptyState({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "smoke-ambient rounded-[var(--radius-xl)] border border-line-gold/45 bg-ink-2 p-8 text-center md:p-14",
        className,
      )}
    >
      <div aria-hidden className="mx-auto mb-5 h-12 w-12">
        <Symbol size={48} className="h-full w-full" />
      </div>
      {eyebrow && <p className="eyebrow mb-2 text-gold">{eyebrow}</p>}
      <p className="font-display text-[26px] leading-tight tracking-[-0.015em] text-ivory md:text-[34px]">{title}</p>
      {description && <p className="mx-auto mt-3 max-w-md text-[14.5px] leading-relaxed text-stone">{description}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}

/**
 * LuxuryAvatar — Creator or member avatar with optional Portrait study or initial fallback.
 */
export function LuxuryAvatar({
  name,
  src,
  study,
  size = "md",
  ring = "line",
  className,
}: {
  name: string;
  src?: string;
  study?: PortraitStudy;
  size?: "sm" | "md" | "lg";
  ring?: "line" | "gold" | "pink";
  className?: string;
}) {
  const dim = size === "sm" ? "h-9 w-9 text-[14px]" : size === "lg" ? "h-16 w-16 text-[22px]" : "h-12 w-12 text-[17px]";
  const ringCls =
    ring === "gold" ? "border-gold/60" : ring === "pink" ? "border-pink/60" : "border-line-strong";

  if (src || study) {
    return (
      <Portrait
        alt={name}
        src={src}
        study={study}
        sizes="64px"
        className={cn("shrink-0 rounded-full border", dim, ringCls, className)}
      />
    );
  }
  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        "grid shrink-0 place-items-center rounded-full border bg-ink-3 font-display text-gold-soft",
        dim,
        ringCls,
        className,
      )}
    >
      <span aria-hidden>{name.slice(0, 1).toUpperCase()}</span>
    </span>
  );
}

/**
 * LuxuryStatCard — Dashboard & analytics metric card with gold/pink accent indicator.
 */
export function LuxuryStatCard({
  label,
  value,
  sub,
  href,
  accent = "gold",
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  href?: string;
  accent?: "gold" | "pink" | "neutral";
  className?: string;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow text-stone">{label}</p>
        <span
          aria-hidden
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            accent === "pink" ? "bg-pink" : accent === "gold" ? "bg-gold" : "bg-stone/50",
          )}
        />
      </div>
      <p className="mt-3 font-display text-[34px] leading-none tabular-nums text-ivory md:text-[38px]">{value}</p>
      {sub && <p className="mt-2 text-[12.5px] text-ash">{sub}</p>}
    </>
  );
  const cls = cn(
    "smoke-minimal block rounded-[var(--radius-xl)] border border-line bg-ink-2 p-5 transition-colors duration-[260ms]",
    href && "hover:border-gold/45",
    className,
  );
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/**
 * LuxuryTierCard — Gold-accented subscription tier card displaying real database tier details.
 */
export function LuxuryTierCard({
  name,
  kind = "member",
  description,
  priceLabel,
  periodLabel = "per month",
  benefits,
  seatsLeft,
  seatLimit,
  action,
  className,
}: {
  name: string;
  kind?: "follow" | "member" | "vip";
  description?: string;
  priceLabel: string;
  periodLabel?: string;
  benefits: readonly string[];
  seatsLeft?: number | null;
  seatLimit?: number | null;
  action?: ReactNode;
  className?: string;
}) {
  const isVip = kind === "vip";
  return (
    <div
      className={cn(
        "flex flex-col rounded-[var(--radius-xl)] border p-7 transition-colors md:p-9",
        isVip
          ? "smoke-ambient border-gold/45 bg-ink-3 shadow-[var(--mk-shadow-1)]"
          : "smoke-minimal border-line bg-ink-2",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className={cn("font-display text-[34px] leading-none md:text-[38px]", isVip ? "text-metal" : "text-ivory")}>
            {name}
          </h3>
          {description && <p className="mt-2 text-[13.5px] text-stone">{description}</p>}
        </div>
        {seatsLeft != null && seatLimit != null ? (
          <p className="text-right text-[12px] text-stone">
            <span className="block font-display text-[22px] tabular-nums text-gold-soft">{seatsLeft}</span>
            of {seatLimit} seats left
          </p>
        ) : (
          <Badge tone={isVip ? "vip" : kind === "follow" ? "neutral" : "member"}>
            {kind === "follow" ? "Free" : isVip ? "VIP" : "Member"}
          </Badge>
        )}
      </div>

      <p className="mt-6 font-display text-[32px] text-ivory">
        {priceLabel}
        {periodLabel && (
          <span className="ml-2 align-middle font-sans text-[12px] uppercase tracking-[0.18em] text-ash">
            {periodLabel}
          </span>
        )}
      </p>

      <div aria-hidden className={cn("my-6", isVip ? "hairline-pink" : "hairline")} />

      <ul className="space-y-3 text-[14.5px] leading-snug text-ivory/85">
        {benefits.map((perk) => (
          <li key={perk} className="flex gap-3">
            <span
              aria-hidden
              className={cn(
                "mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full",
                isVip ? "bg-pink shadow-[0_0_6px_var(--mk-pink)]" : "bg-gold",
              )}
            />
            <span>{perk}</span>
          </li>
        ))}
      </ul>

      {action && <div className="mt-auto pt-8">{action}</div>}
    </div>
  );
}

