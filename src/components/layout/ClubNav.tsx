"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { getWorkspaceCopy, type Locale } from "@/lib/i18n";
import { switchLocaleAction, switchWorkspaceAction } from "@/server/actions/workspace";
import { signOutAction } from "@/server/actions/auth";
import type { WorkspaceMode } from "@/server/auth/permissions";

export type NavIconName =
  | "home"
  | "discover"
  | "invite"
  | "house"
  | "account"
  | "studio"
  | "library"
  | "messages"
  | "posts"
  | "vault"
  | "blasts"
  | "members"
  | "tiers"
  | "earnings"
  | "referrals"
  | "notices"
  | "settings"
  | "participants";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIconName;
  badge?: number;
  exact?: boolean;
};

const icons: Record<NavIconName, React.ReactNode> = {
  home: <path d="M3 9.2 10 3l7 6.2V16.5H12.5v-4.5h-5v4.5H3V9.2Z" />,
  discover: <path d="M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Zm3 4.5-1.8 4.2L7 13l1.8-4.2L13 7Z" />,
  invite: <path d="M3 5.5h14v9H3zM3.5 6l6.5 5 6.5-5" />,
  house: <path d="M10 2.5 3 6.5v1h14v-1L10 2.5ZM4.5 8.5v6M8 8.5v6M12 8.5v6M15.5 8.5v6M3 16h14" />,
  studio: <path d="M3 16.5h14M5 16.5V9l5-5.5L15 9v7.5M8 16.5v-4h4v4" />,
  library: <path d="M4 3.5h3v13H4zM8.5 3.5h3v13h-3zM13 4.2l2.8-.7 2.7 12.4-2.8.6z" />,
  messages: <path d="M3.5 4.5h13v9h-7l-4 3v-3h-2z" />,
  account: <path d="M10 2.5 4 5v4.5c0 3.6 2.6 6.6 6 8 3.4-1.4 6-4.4 6-8V5l-6-2.5Zm-2.5 7.5 2 2 3.5-4" />,
  posts: <path d="M4 4h12v12H4zM7 8h6M7 12h4" />,
  vault: <path d="M3.5 5.5h13v10h-13zM7 5.5V4a3 3 0 0 1 6 0v1.5M10 9.5v3" />,
  blasts: <path d="M3 10.5 16.5 4v12L3 10.5Zm3.5 1.8v3.2h2.5" />,
  members: <path d="M7.5 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm6 1a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM2.5 16.5c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5M13 16.5c0-1.8 1.5-3.3 3.5-3.5" />,
  tiers: <path d="M10 2.5 12.4 7l5.1.7-3.7 3.6.9 5.2-4.7-2.5-4.7 2.5.9-5.2L2.5 7.7 7.6 7 10 2.5Z" />,
  earnings: <path d="M10 2.5v15M6.5 6.5c0-1.4 1.6-2.5 3.5-2.5s3.5 1.1 3.5 2.5S12 9 10 9s-3.5 1.1-3.5 2.5S8.1 14 10 14s3.5-1.1 3.5-2.5" />,
  referrals: <path d="M7 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7-3h3m-1.5-1.5v3M2.5 16.5c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5" />,
  notices: <path d="M10 2.8a4.7 4.7 0 0 0-4.7 4.7v2.9L3.8 13.5h12.4l-1.5-3.1V7.5A4.7 4.7 0 0 0 10 2.8ZM8 15.6a2 2 0 0 0 4 0" />,
  settings: <path d="M10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm0-4.5v2m0 11v2M4 4l1.4 1.4m9.2 9.2L16 16M2.5 10h2m11 0h2M4 16l1.4-1.4m9.2-9.2L16 4" />,
  participants: <path d="M5 3.5h10v13H5zM7.5 7.5h5M7.5 10.5h5M7.5 13.5h3" />,
};

export function resolvePathWorkspace(
  pathname: string,
  isCreator: boolean,
  defaultWorkspace: WorkspaceMode,
): WorkspaceMode {
  if (!isCreator) return "fan";
  if (pathname === "/studio" || pathname.startsWith("/studio/")) {
    return "studio";
  }
  const fanExplicitPrefixes = ["/home", "/discover", "/c/", "/library", "/messages", "/refer"];
  if (
    fanExplicitPrefixes.some(
      (prefix) =>
        pathname === prefix ||
        pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`),
    )
  ) {
    return "fan";
  }
  return defaultWorkspace;
}

export function ClubHeaderControls({
  isCreator,
  isOwner,
  defaultWorkspace,
  fanDisplayName,
  creatorDisplayName,
  ownerDisplayName,
  unreadNotifications,
  locale,
}: {
  isCreator: boolean;
  isOwner: boolean;
  defaultWorkspace: WorkspaceMode;
  fanDisplayName: string;
  creatorDisplayName: string;
  ownerDisplayName?: string;
  unreadNotifications: number;
  locale: Locale;
}) {
  const path = usePathname() || "/home";
  const activeWorkspace = resolvePathWorkspace(path, isCreator, defaultWorkspace);
  const copy = getWorkspaceCopy(locale);

  const displayName = isOwner
    ? (ownerDisplayName ?? fanDisplayName)
    : activeWorkspace === "studio"
      ? creatorDisplayName
      : fanDisplayName;

  const roleBadge = isOwner
    ? copy.ownerRoleBadge
    : activeWorkspace === "studio"
      ? copy.creatorStudioRoleBadge
      : copy.fanRoleBadge;

  const workspaceBadge = isOwner
    ? copy.ownerWorkspaceBadge
    : activeWorkspace === "studio"
      ? copy.studioWorkspaceBadge
      : copy.fanWorkspaceBadge;

  const switchTarget: WorkspaceMode = activeWorkspace === "studio" ? "fan" : "studio";
  const switchLabel =
    activeWorkspace === "studio" ? copy.switchToFanView : copy.switchToCreatorStudio;

  const notificationsHref =
    activeWorkspace === "studio" && isCreator ? "/studio/notices" : "/notifications";

  return (
    <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
      {/* Active Workspace Pill */}
      <span
        data-testid="active-workspace-badge"
        className={cn(
          "hidden items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] md:inline-flex",
          activeWorkspace === "studio"
            ? "border-gold/45 bg-gold/[0.12] text-gold-soft"
            : "border-line-strong bg-obsidian/70 text-stone",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            activeWorkspace === "studio" ? "bg-pink shadow-[0_0_8px_var(--mk-pink)]" : "bg-gold",
          )}
        />
        {workspaceBadge}
      </span>

      {/* Explicit Workspace Switcher (Eligible Creators Only) */}
      {isCreator && (
        <form action={switchWorkspaceAction}>
          <input type="hidden" name="workspace" value={switchTarget} />
          <button
            type="submit"
            data-testid="workspace-switcher-button"
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[12px] font-medium transition-colors",
              activeWorkspace === "studio"
                ? "border-line-strong bg-ink-2 text-ivory hover:border-gold/50 hover:text-gold-soft"
                : "border-gold/45 bg-gold/[0.12] text-gold-soft hover:bg-gold/[0.2]",
            )}
          >
            <svg
              aria-hidden
              viewBox="0 0 20 20"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            >
              <path d="M4 7h12l-3-3M16 13H4l3 3" />
            </svg>
            <span>{switchLabel}</span>
          </button>
        </form>
      )}

      {/* Language Switcher (EN / FR / AR) */}
      <form action={switchLocaleAction} className="hidden items-center sm:flex">
        <input type="hidden" name="returnTo" value={path} />
        <div
          role="group"
          aria-label="Language"
          className="inline-flex items-center rounded-full border border-line bg-obsidian/65 p-0.5 text-[11px]"
        >
          {(
            [
              { code: "en", label: "EN" },
              { code: "fr", label: "FR" },
              { code: "ar", label: "ع" },
            ] as const
          ).map((lang) => (
            <button
              key={lang.code}
              type="submit"
              name="locale"
              value={lang.code}
              aria-pressed={locale === lang.code}
              className={cn(
                "rounded-full px-2 py-0.5 transition-colors",
                locale === lang.code
                  ? "bg-gold/[0.18] font-medium text-gold-soft"
                  : "text-ash hover:text-ivory",
              )}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </form>

      {/* Notifications */}
      <Link
        href={notificationsHref}
        className="relative grid h-9 w-9 place-items-center rounded-full border border-line-strong text-stone hover:text-ivory"
        aria-label={
          unreadNotifications
            ? `${copy.notifications}, ${unreadNotifications} unread`
            : copy.notifications
        }
      >
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className="h-[17px] w-[17px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        >
          <path d="M10 2.8a4.7 4.7 0 0 0-4.7 4.7v2.9L3.8 13.5h12.4l-1.5-3.1V7.5A4.7 4.7 0 0 0 10 2.8ZM8 15.6a2 2 0 0 0 4 0" />
        </svg>
        {unreadNotifications > 0 && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-gold px-1 text-[10px] font-medium text-ink"
          >
            {unreadNotifications > 9 ? "9+" : unreadNotifications}
          </span>
        )}
      </Link>

      {/* Workspace-Scoped Identity Display */}
      <span
        data-testid="header-identity"
        className="hidden text-right text-[13px] leading-tight sm:block"
      >
        <span className="block font-medium text-ivory">{displayName}</span>
        <span className="block text-[10px] uppercase tracking-[0.18em] text-ash">
          {roleBadge}
        </span>
      </span>

      <form action={signOutAction}>
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-full px-3 text-[13px] text-stone transition-colors hover:text-ivory"
        >
          {copy.signOut}
        </button>
      </form>
    </div>
  );
}

export function ClubNav({
  fanItems,
  fanSecondaryItems = [],
  studioItems = [],
  studioSecondaryItems = [],
  isCreator = false,
  defaultWorkspace = "fan",
  creatorDisplayName,
  fanDisplayName,
  locale = "en",
  variant,
}: {
  fanItems: NavItem[];
  fanSecondaryItems?: NavItem[];
  studioItems?: NavItem[];
  studioSecondaryItems?: NavItem[];
  isCreator?: boolean;
  defaultWorkspace?: WorkspaceMode;
  creatorDisplayName?: string;
  fanDisplayName?: string;
  locale?: Locale;
  variant: "sidebar" | "bottom";
}) {
  const path = usePathname() || "/home";
  const activeWorkspace = resolvePathWorkspace(path, isCreator, defaultWorkspace);
  const copy = getWorkspaceCopy(locale);

  const isActive = (it: NavItem) => {
    if (it.exact) return path === it.href;
    if (it.href === "/account/security") return path.startsWith("/account");
    if (it.href === "/discover") {
      return path === "/discover" || path.startsWith("/discover/") || path.startsWith("/c/");
    }
    return path === it.href || path.startsWith(`${it.href}/`);
  };

  const activePrimaryItems =
    activeWorkspace === "studio" && isCreator ? studioItems : fanItems;
  const activeSecondaryItems =
    activeWorkspace === "studio" && isCreator ? studioSecondaryItems : fanSecondaryItems;

  if (variant === "sidebar") {
    return (
      <aside
        aria-label={
          activeWorkspace === "studio"
            ? "Primary Creator Studio navigation"
            : "Primary Fan View navigation"
        }
        className="hidden w-64 shrink-0 border-r border-line bg-obsidian/45 md:block"
      >
        <div className="sticky top-[68px] flex h-[calc(100svh-68px)] flex-col justify-between overflow-y-auto px-4 py-6">
          <div className="space-y-6">
            {/* Active Workspace Header inside Sidebar */}
            <div className="rounded-[var(--radius-md)] border border-line bg-ink-2/65 px-3.5 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] uppercase tracking-[0.22em] text-gold">
                  {activeWorkspace === "studio"
                    ? copy.studioWorkspaceBadge
                    : copy.fanWorkspaceBadge}
                </p>
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-2 w-2 rounded-full",
                    activeWorkspace === "studio"
                      ? "bg-pink shadow-[0_0_8px_var(--mk-pink)]"
                      : "bg-gold",
                  )}
                />
              </div>
              <p
                className="mt-1 truncate font-display text-[19px] text-ivory"
                title={
                  activeWorkspace === "studio" ? creatorDisplayName : fanDisplayName
                }
              >
                {activeWorkspace === "studio" ? creatorDisplayName : fanDisplayName}
              </p>
            </div>

            <div>
              <p className="px-3 text-[10px] uppercase tracking-[0.24em] text-ash">
                {activeWorkspace === "studio"
                  ? copy.studioWorkspaceBadge
                  : copy.fanWorkspaceBadge}
              </p>
              <ul className="mt-2 space-y-1">
                {activePrimaryItems.map((it) => {
                  const active = isActive(it);
                  return (
                    <li key={it.href}>
                      <Link
                        href={it.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center justify-between rounded-[var(--radius-md)] px-3.5 py-2.5 text-[14px] transition-colors",
                          active
                            ? "border border-gold/35 bg-gold/[0.1] font-medium text-gold-soft"
                            : "border border-transparent text-stone hover:bg-surface/60 hover:text-ivory",
                        )}
                      >
                        <span className="flex items-center gap-3">
                          <svg
                            aria-hidden
                            viewBox="0 0 20 20"
                            className="h-[18px] w-[18px] shrink-0"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinejoin="round"
                          >
                            {icons[it.icon]}
                          </svg>
                          <span>{it.label}</span>
                        </span>
                        {!!it.badge && it.badge > 0 && (
                          <span
                            aria-label={`${it.badge} unread`}
                            className="grid h-5 min-w-5 place-items-center rounded-full bg-gold px-1.5 text-[11px] font-semibold text-ink"
                          >
                            {it.badge > 99 ? "99+" : it.badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>

            {activeSecondaryItems.length > 0 && (
              <div className="border-t border-line pt-5">
                <p className="px-3 text-[10px] uppercase tracking-[0.24em] text-ash">
                  {activeWorkspace === "studio" ? "Compliance & Account" : "More"}
                </p>
                <ul className="mt-2 space-y-1">
                  {activeSecondaryItems.map((it) => {
                    const active = isActive(it);
                    return (
                      <li key={it.href}>
                        <Link
                          href={it.href}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex items-center gap-3 rounded-[var(--radius-md)] px-3.5 py-2 text-[13px] transition-colors",
                            active
                              ? "border border-gold/35 bg-gold/[0.1] text-gold-soft"
                              : "border border-transparent text-stone hover:bg-surface/60 hover:text-ivory",
                          )}
                        >
                          <svg
                            aria-hidden
                            viewBox="0 0 20 20"
                            className="h-4 w-4 shrink-0"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinejoin="round"
                          >
                            {icons[it.icon]}
                          </svg>
                          <span>{it.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Explicit Workspace Switcher inside Sidebar for Creators */}
            {isCreator && (
              <div className="border-t border-line pt-4">
                <form action={switchWorkspaceAction}>
                  <input
                    type="hidden"
                    name="workspace"
                    value={activeWorkspace === "studio" ? "fan" : "studio"}
                  />
                  <button
                    type="submit"
                    className="flex w-full items-center justify-between rounded-[var(--radius-md)] border border-line-strong bg-ink/60 px-3.5 py-2.5 text-[13px] text-ivory transition-colors hover:border-gold/45 hover:text-gold-soft"
                  >
                    <span>
                      {activeWorkspace === "studio"
                        ? copy.switchToFanView
                        : copy.switchToCreatorStudio}
                    </span>
                    <span aria-hidden="true" className="text-gold">→</span>
                  </button>
                </form>
              </div>
            )}
          </div>

          <div className="mt-6 rounded-[var(--radius-md)] border border-line bg-ink/50 p-3.5 text-[12px] text-stone">
            <p className="font-medium text-ivory">
              {activeWorkspace === "studio"
                ? copy.studioSanctuaryTitle
                : copy.fanSanctuaryTitle}
            </p>
            <p className="mt-1 leading-relaxed text-ash">
              {activeWorkspace === "studio"
                ? copy.studioSanctuaryBody
                : copy.fanSanctuaryBody}
            </p>
          </div>
        </div>
      </aside>
    );
  }

  // Mobile Bottom Navigation — strictly scoped to the active workspace
  const mobileBarItems =
    activeWorkspace === "studio" && isCreator
      ? studioItems.slice(0, 5)
      : fanItems.slice(0, 5);

  return (
    <nav
      aria-label={
        activeWorkspace === "studio"
          ? "Mobile Creator Studio navigation"
          : "Mobile Fan View navigation"
      }
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-ink/95 backdrop-blur-md md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {mobileBarItems.map((it) => {
          const active = isActive(it);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-[60px] flex-col items-center justify-center gap-1 px-1 text-[11px] tracking-[0.04em] transition-colors",
                  active ? "font-medium text-gold" : "text-stone hover:text-ivory",
                )}
              >
                <span className="relative">
                  <svg
                    aria-hidden
                    viewBox="0 0 20 20"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                  >
                    {icons[it.icon]}
                  </svg>
                  {!!it.badge && it.badge > 0 && (
                    <span
                      aria-label={`${it.badge} unread`}
                      className="absolute -right-2.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-gold px-1 text-[10px] font-semibold text-ink"
                    >
                      {it.badge > 9 ? "9+" : it.badge}
                    </span>
                  )}
                </span>
                <span className="truncate">{it.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
