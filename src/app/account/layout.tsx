import type { Metadata } from "next";
import { ClubShell } from "@/components/layout/ClubShell";
import { Submit } from "@/components/forms";
import { signOutAction } from "@/server/actions/auth";
import {
  getLocaleCookie,
  getWorkspaceCookie,
  requireViewer,
} from "@/server/auth/request";
import { unreadMessagesByWorkspace } from "@/server/services/messaging";
import { unreadCount } from "@/server/services/notifications";
import {
  resolveActiveWorkspace,
  resolveWorkspaceIdentity,
} from "@/server/services/workspace";
import { AccountTabs } from "./AccountTabs";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  // The account area is reachable during mandatory owner MFA setup; nothing else is.
  const viewer = await requireViewer(undefined, { allowMfaSetup: true });
  const [unread, unreadByWorkspace, cookieWorkspace, locale] = await Promise.all([
    unreadCount(viewer),
    unreadMessagesByWorkspace(viewer),
    getWorkspaceCookie(),
    getLocaleCookie(),
  ]);
  const workspace = resolveActiveWorkspace(viewer, "/account/security", cookieWorkspace);
  const activeIdentity = resolveWorkspaceIdentity(viewer, workspace, locale);
  const fanIdentity = resolveWorkspaceIdentity(viewer, "fan", locale);
  const studioIdentity = resolveWorkspaceIdentity(viewer, "studio", locale);

  const initials = activeIdentity.displayName
    .replace(/^Diva\s+/i, "")
    .slice(0, 2)
    .toUpperCase();

  return (
    <ClubShell
      viewer={viewer}
      unread={unread}
      unreadMessages={unreadByWorkspace.total}
      unreadFanMessages={unreadByWorkspace.fan}
      unreadCreatorMessages={unreadByWorkspace.creator}
      workspace={workspace}
      locale={locale}
    >
      <div className="mx-auto max-w-[1100px] px-5 pt-8 md:px-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-line bg-obsidian/55 p-5">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-gold/40 bg-gold/[0.12] font-display text-[22px] text-gold-soft">
              {initials}
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-gold-soft">
                {viewer.role === "owner"
                  ? "Owner Account"
                  : workspace === "studio"
                    ? "Creator Studio · Account"
                    : "Fan View · Account"}
              </p>
              <h2 className="mt-0.5 font-display text-[28px] leading-tight text-ivory">
                {activeIdentity.displayName}
              </h2>
              {viewer.role === "creator" ? (
                <p className="text-[12px] text-stone">
                  Creator Studio identity:{" "}
                  <span className="text-ivory">{studioIdentity.displayName}</span> · Fan View alias:{" "}
                  <span className="text-gold-soft">{fanIdentity.displayName}</span>
                </p>
              ) : (
                <p className="text-[12px] text-stone">
                  Private identity protected · Shown as{" "}
                  <span className="text-ivory">{activeIdentity.displayName}</span>
                </p>
              )}
            </div>
          </div>
          <form action={signOutAction}>
            <Submit variant="outline" className="h-10 px-5 text-[13px]">
              Sign out
            </Submit>
          </form>
        </div>
        <AccountTabs showPrivacy={viewer.role !== "owner" && viewer.mfa !== "pending"} />
      </div>
      {children}
    </ClubShell>
  );
}
