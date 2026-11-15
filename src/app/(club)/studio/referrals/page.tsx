import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReferralForm } from "@/app/(club)/refer/ReferralForm";
import { CopyLink } from "@/components/studio/CopyLink";
import { StudioHeader } from "@/components/studio/StudioHeader";
import { Badge } from "@/components/ui/Badge";
import { brand } from "@/config/brand";
import { requireViewer } from "@/server/auth/request";
import { featureEnabled } from "@/server/flags";
import { formatMoney } from "@/server/payments";
import { getOnboarding } from "@/server/services/creatorOnboarding";
import { myReferralCount } from "@/server/services/creatorReferral";
import { myDetailedStudioEarnings } from "@/server/services/earnings";
import { myReferrals } from "@/server/services/referrals";

export const metadata: Metadata = { title: "Referrals & Fan Invites · Creator Studio" };

const tone = { pending: "neutral", approved: "vip", declined: "locked" } as const;
const label = { pending: "With the house", approved: "Invitation issued", declined: "Declined" } as const;

export default async function StudioReferralsPage() {
  const viewer = await requireViewer("club.discover");
  if (viewer.role !== "creator") notFound();

  const [ob, fanJoinedCount, detailed, houseReferrals] = await Promise.all([
    getOnboarding(viewer),
    myReferralCount(viewer),
    myDetailedStudioEarnings(viewer),
    myReferrals(viewer),
  ]);

  const handle = ob.profile?.handle;
  const fanInviteUrl = handle ? `${brand.siteUrl}/join/${handle}` : null;
  const creatorRecruitmentUrl = `${brand.siteUrl}${detailed.recruitmentLink.recruitmentPath}`;
  const fanReferralsOpen = featureEnabled("creator_referrals");
  const creatorHouseNominations = houseReferrals.filter((r) => r.intended_role === "creator");
  const primaryBal = detailed.detailedBalances[0];
  const pendingReferralCents = primaryBal?.referralPendingCents ?? 0;
  const availableReferralCents = primaryBal?.referralAvailableCents ?? 0;
  const currency = primaryBal?.currency ?? "USD";

  return (
    <div className="mx-auto max-w-[1100px] px-5 pb-28 pt-6 md:px-10 md:pt-8">
      <StudioHeader
        eyebrow="Creator Studio · Growth & Recruitment"
        title="Referrals"
        lede="Separate tools to invite fans to your profile and to refer fellow creators for direct single-level referral rewards."
      />

      {/* 1. Invite Fans */}
      <section
        aria-labelledby="invite-fans-h"
        className="mt-8 rounded-[var(--radius-xl)] border border-gold/35 bg-ink-2 p-6 md:p-8"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow text-gold">Audience Growth</p>
            <h2 id="invite-fans-h" className="mt-1 font-display text-[28px] text-ivory">
              Invite fans
            </h2>
          </div>
          <Badge tone="member">Fan profile link</Badge>
        </div>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-stone">
          Share your fan invitation link so new fans can join DivaFans and land directly on your profile. This link is strictly for fan accounts and never creates a creator account.
        </p>
        {fanInviteUrl ? (
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 truncate rounded-[var(--radius-sm)] bg-ink px-3.5 py-2.5 text-[13px] text-ivory">
              {fanInviteUrl}
            </code>
            <CopyLink url={fanInviteUrl} label="Copy fan invite link" className="shrink-0" />
            <span className="shrink-0 rounded-full border border-line-strong bg-obsidian px-3.5 py-1.5 text-[13px] text-stone">
              <strong className="tabular-nums text-ivory">{fanJoinedCount}</strong> fan{fanJoinedCount === 1 ? "" : "s"} joined
            </span>
          </div>
        ) : (
          <p className="mt-4 text-[14px] text-ash">
            Save your profile handle in{" "}
            <Link href="/studio/settings" className="text-gold underline underline-offset-4">
              Studio Settings
            </Link>{" "}
            to activate your fan invitation link.
          </p>
        )}
        {!fanReferralsOpen && (
          <p className="mt-3 text-[12px] text-ash">
            Note: Direct fan signup links are currently gated by the house configuration.
          </p>
        )}
      </section>

      {/* 2. Refer a Creator (Direct Single-Level Creator Recruitment) */}
      <section
        aria-labelledby="refer-creator-h"
        className="mt-8 rounded-[var(--radius-xl)] border border-pink/35 bg-ink-2 p-6 md:p-8"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow text-pink">Direct Creator Recruitment · 1.5% Commission</p>
            <h2 id="refer-creator-h" className="mt-1 font-display text-[28px] text-ivory">
              Refer a creator
            </h2>
          </div>
          <Badge tone="vip">10% of 15% platform fee</Badge>
        </div>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-stone">
          Recruit fellow creators with your unique recruitment link. You earn{" "}
          <strong className="text-ivory">10% of the 15% platform fee (1.5% of eligible sales)</strong> generated by creators you directly refer — funded entirely from the platform fee so the referred creator always keeps their full{" "}
          <strong className="text-ivory">85%</strong> allocation. Single-level only.
        </p>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 truncate rounded-[var(--radius-sm)] bg-ink px-3.5 py-2.5 text-[13px] text-gold-soft">
            {creatorRecruitmentUrl}
          </code>
          <CopyLink url={creatorRecruitmentUrl} label="Copy creator referral link" className="shrink-0" />
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-[var(--radius-lg)] border border-line bg-obsidian/55 p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-ash">Referred creators</p>
            <p className="mt-1.5 font-display text-[28px] text-ivory">
              {detailed.referredCreators.length}
            </p>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-line bg-obsidian/55 p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-ash">Pending referral earnings</p>
            <p className="mt-1.5 font-display text-[28px] text-gold-soft">
              {formatMoney({ amountCents: pendingReferralCents, currency })}
            </p>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-line bg-obsidian/55 p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-ash">Available referral balance</p>
            <p className="mt-1.5 font-display text-[28px] text-emerald-300">
              {formatMoney({ amountCents: availableReferralCents, currency })}
            </p>
          </div>
        </div>

        {detailed.referredCreators.length > 0 && (
          <div className="mt-6">
            <h3 className="text-[14px] font-medium text-ivory">Directly referred creators</h3>
            <ul className="mt-3 divide-y divide-line rounded-[var(--radius-md)] border border-line bg-obsidian/45">
              {detailed.referredCreators.map((rc) => {
                const earnedCents = detailed.referralCommissions
                  .filter((c) => c.referredCreatorId === rc.referredCreatorId)
                  .reduce((sum, c) => sum + (c.commissionCents - c.refundedCommissionCents), 0);
                return (
                  <li
                    key={rc.referredCreatorId}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13px]"
                  >
                    <div>
                      <span className="font-medium text-ivory">{rc.displayName}</span>
                      {rc.handle && <span className="ml-2 text-stone">@{rc.handle}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge tone={rc.status === "confirmed" ? "vip" : "neutral"}>{rc.status}</Badge>
                      <span className="font-mono text-gold-soft">
                        {formatMoney({ amountCents: earnedCents, currency })} earned
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      {/* 3. White-glove Creator Nomination to the House */}
      <section
        aria-labelledby="nominate-creator-h"
        className="mt-8 grid gap-8 rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:grid-cols-12 md:p-8"
      >
        <div className="md:col-span-5">
          <p className="eyebrow text-gold">Concierge Onboarding</p>
          <h2 id="nominate-creator-h" className="mt-1 font-display text-[28px] text-ivory">
            Nominate a creator to the house
          </h2>
          <p className="mt-3 text-[14px] leading-relaxed text-stone">
            Want the house to personally reach out and issue a single-use creator invitation? Submit their details here for review.
          </p>
          {creatorHouseNominations.length > 0 && (
            <div className="mt-6">
              <h3 className="text-[13px] uppercase tracking-[0.18em] text-ash">Submitted nominations</h3>
              <ul className="mt-3 divide-y divide-line border-y border-line">
                {creatorHouseNominations.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-3 text-[13px]">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ivory">{r.invitee_name}</p>
                      <p className="truncate text-stone">{r.invitee_email}</p>
                    </div>
                    <Badge tone={tone[r.status]}>{label[r.status]}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="md:col-span-7">
          <ReferralForm fixedRole="creator" />
        </div>
      </section>
    </div>
  );
}
