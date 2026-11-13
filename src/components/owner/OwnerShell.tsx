import Link from "next/link";
import type { ReactNode } from "react";
import { brand } from "@/config/brand";
import { Symbol } from "@/components/brand/Symbol";
import { Wordmark } from "@/components/brand/Wordmark";
import { Submit } from "@/components/forms";
import { signOutAction } from "@/server/actions/auth";
import { can, type Permission, type Viewer } from "@/server/auth/permissions";
import type { ResolvedOwner } from "@/server/services/ownerFinance";
import { OwnerNav, type OwnerNavItem } from "./OwnerNav";

const ALL_NAV_ITEMS: { href: string; label: string; permission: Permission }[] = [
  { href: "/owner", label: "Overview", permission: "owner.dashboard.view" },
  { href: "/owner/revenue", label: "Platform Revenue", permission: "owner.revenue.view" },
  { href: "/owner/share", label: "My 50% Share", permission: "owner.share.view" },
  { href: "/owner/distributions", label: "Distributions", permission: "owner.distributions.view" },
  { href: "/owner/payouts", label: "Payout Accounts", permission: "owner.payout_accounts.manage" },
  { href: "/owner/creators", label: "Creator Management", permission: "owner.creators.view" },
  { href: "/owner/analytics", label: "Platform Analytics", permission: "owner.analytics.view" },
  { href: "/owner/reports", label: "Financial Reports", permission: "owner.reports.view" },
  { href: "/owner/approvals", label: "Approvals", permission: "owner.distributions.approve" },
  { href: "/owner/audit", label: "Audit History", permission: "owner.audit.view" },
  { href: "/owner/settings", label: "Settings", permission: "owner.settings.view" },
];

export function formatMinorCurrency(minor: number, currency = "usd"): string {
  const curr = currency.toUpperCase();
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(minor));
  const major = Math.floor(abs / 100);
  const cents = String(abs % 100).padStart(2, "0");
  const symbol = curr === "USD" ? "$" : curr === "EUR" ? "€" : curr === "GBP" ? "£" : `${curr} `;
  return `${sign}${symbol}${major.toLocaleString("en-US")}.${cents}`;
}

export function OwnerShell({
  viewer,
  owner,
  accountCode,
  children,
}: {
  viewer: Viewer;
  owner: ResolvedOwner;
  accountCode: "Account A" | "Account B";
  children: ReactNode;
}) {
  const navItems: OwnerNavItem[] = ALL_NAV_ITEMS.filter((item) => can(viewer, item.permission)).map(
    ({ href, label }) => ({ href, label }),
  );

  return (
    <div
      className="min-h-[100svh] bg-[#08070a] text-[#f4efe8]"
      style={{
        backgroundImage:
          "radial-gradient(900px 420px at 16% 0%, rgba(214, 179, 106, 0.09), transparent 70%), radial-gradient(760px 360px at 86% 6%, rgba(255, 46, 147, 0.07), transparent 72%)",
      }}
    >
      <header className="sticky top-0 z-50 border-b border-line bg-[#08070a]/85 backdrop-blur-md">
        <div className="mx-auto flex h-[68px] max-w-[1480px] items-center justify-between gap-4 px-5 md:px-10">
          <div className="flex items-center gap-4">
            <Link href="/owner" className="flex items-center gap-3 rounded-md">
              <span className="sr-only">{`${brand.name} — Owner Console`}</span>
              <Symbol size={34} />
              <Wordmark decorative tone="duotone" className="hidden text-[15px] sm:inline-flex" />
            </Link>
            <span className="hidden h-4 w-px bg-line sm:inline-block" aria-hidden />
            <span className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-gold-soft">
              Executive Governance
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="hidden rounded-full border border-line-strong px-3.5 py-1.5 text-[12px] text-stone transition-colors hover:border-gold/50 hover:text-ivory md:inline-block"
            >
              House Operations
            </Link>
            <Link
              href="/discover"
              className="hidden rounded-full border border-line-strong px-3.5 py-1.5 text-[12px] text-stone transition-colors hover:border-gold/50 hover:text-ivory lg:inline-block"
            >
              Club View
            </Link>
            <div className="hidden text-right text-[12px] leading-tight sm:block" data-testid="owner-identity-pill">
              <span className="block font-medium text-ivory">{owner.displayName}</span>
              <span className="block text-[10px] uppercase tracking-[0.18em] text-gold-soft">
                {owner.id} · {owner.percentageDisplay} Share
              </span>
            </div>
            <form action={signOutAction}>
              <Submit variant="ghost" className="h-9 px-3.5 text-[12px]">
                Sign out
              </Submit>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1480px] px-5 py-8 md:px-10 md:py-10">
        <section
          aria-label="Authenticated owner summary"
          className="relative mb-8 overflow-hidden rounded-2xl border border-gold/25 bg-[#100e14]/85 p-6 shadow-[0_24px_64px_-24px_rgba(0,0,0,0.85)] backdrop-blur-md md:p-8"
        >
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <span
                  data-testid="owner-code-badge"
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#ff2e93]/45 bg-[#ff2e93]/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-[#ff85c0]"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[#ff2e93]" aria-hidden />
                  {owner.id}
                </span>
                <span
                  data-testid="owner-share-badge"
                  className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-gold-soft"
                >
                  Economic Ownership: {owner.percentageDisplay} ({owner.percentageBasisPoints} bps)
                </span>
                <span
                  data-testid="owner-destination-badge"
                  className="rounded-full border border-line-strong bg-charcoal/80 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-stone"
                >
                  Private Destination: {accountCode}
                </span>
              </div>

              <h1
                data-testid="owner-welcome-heading"
                className="mt-4 font-display text-[clamp(1.85rem,3vw,2.65rem)] leading-[1.08] text-ivory"
              >
                {owner.welcomeHeader}
              </h1>
              <p className="mt-2 max-w-[68ch] text-[14px] text-stone">
                Equal 50/50 net distributable earnings governance. Creator contractual earnings are strictly segregated,
                and all owner distributions require dual AAL2 approval from both Jade and Kael Veyre.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:shrink-0">
              <div className="rounded-xl border border-line bg-[#0b090e]/90 px-4 py-3">
                <span className="block text-[10px] uppercase tracking-[0.18em] text-stone">Display Identity</span>
                <span data-testid="owner-display-name" className="mt-1 block font-display text-[19px] text-ivory">
                  {owner.displayName}
                </span>
              </div>
              <div className="rounded-xl border border-line bg-[#0b090e]/90 px-4 py-3">
                <span className="block text-[10px] uppercase tracking-[0.18em] text-stone">Ownership Share</span>
                <span data-testid="owner-ownership-pct" className="mt-1 block font-display text-[19px] text-gold-soft">
                  {owner.percentageDisplay}
                </span>
              </div>
              <div className="col-span-2 rounded-xl border border-line bg-[#0b090e]/90 px-4 py-3 sm:col-span-1">
                <span className="block text-[10px] uppercase tracking-[0.18em] text-stone">Payout Scope</span>
                <span data-testid="owner-private-account" className="mt-1 block font-display text-[19px] text-ivory">
                  {accountCode} Only
                </span>
              </div>
            </div>
          </div>

          <div className="mt-7">
            <OwnerNav items={navItems} />
          </div>
        </section>

        <main id="main" tabIndex={-1} className="outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}

