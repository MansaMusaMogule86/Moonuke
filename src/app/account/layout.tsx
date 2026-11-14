import type { Metadata } from "next";
import { ClubShell } from "@/components/layout/ClubShell";
import { Submit } from "@/components/forms";
import { formatCreatorPublicName } from "@/lib/creatorName";
import { signOutAction } from "@/server/actions/auth";
import { VERIFIED_OWNER_USER_IDS } from "@/server/auth/permissions";
import { requireViewer } from "@/server/auth/request";
import { unreadMessagesCount } from "@/server/services/messaging";
import { unreadCount } from "@/server/services/notifications";
import { AccountTabs } from "./AccountTabs";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  // The account area is reachable during mandatory owner MFA setup; nothing else is.
  const viewer = await requireViewer(undefined, { allowMfaSetup: true });
  const [unread, unreadMessages] = await Promise.all([unreadCount(viewer), unreadMessagesCount(viewer)]);
  const displayAlias =
    viewer.id === VERIFIED_OWNER_USER_IDS.OWNER_001
      ? "Jade"
      : viewer.id === VERIFIED_OWNER_USER_IDS.OWNER_002
        ? "Kael Veyre"
        : viewer.role === "creator"
          ? formatCreatorPublicName(viewer.alias)
          : viewer.alias;
  const initials = displayAlias
    .replace(/^Diva\s+/i, "")
    .slice(0, 2)
    .toUpperCase();

  return (
    <ClubShell viewer={viewer} unread={unread} unreadMessages={unreadMessages}>
      <div className="mx-auto max-w-[1100px] px-5 pt-8 md:px-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-line bg-obsidian/55 p-5">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-gold/40 bg-gold/[0.12] font-display text-[22px] text-gold-soft">
              {initials}
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-gold-soft">
                {viewer.role === "member" ? "Fan Account" : viewer.role === "creator" ? "Creator & Fan Account" : "Owner Account"}
              </p>
              <h2 className="mt-0.5 font-display text-[28px] leading-tight text-ivory">{displayAlias}</h2>
              <p className="text-[12px] text-stone">
                Private identity protected · Shown as <span className="text-ivory">{displayAlias}</span>
              </p>
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
