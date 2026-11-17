import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveRecruitmentCode } from "@/server/services/creatorReferralsAndWithdrawals";
import { RememberRecruitment } from "./RememberRecruitment";

export const metadata: Metadata = {
  title: "Creator Recruitment · DivaFans",
};

export default async function CreatorRecruitmentLandingPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const referrer = await resolveRecruitmentCode(code);
  if (!referrer) notFound();

  return (
    <main className="mx-auto flex min-h-screen max-w-[680px] flex-col justify-center px-6 py-16">
      <RememberRecruitment code={referrer.recruitmentCode} />
      <div className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-8 md:p-10">
        <p className="eyebrow text-gold-soft">Direct Creator Recruitment</p>
        <h1 className="mt-2 font-display text-[34px] leading-tight text-ivory">
          Invited to create on DivaFans by {referrer.displayName}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-stone">
          You have been invited by <strong className="text-ivory">{referrer.displayName}</strong> (@{referrer.handle}) to
          apply as a creator on DivaFans.
        </p>

        <div className="mt-6 space-y-3 rounded-[var(--radius-lg)] border border-line bg-ink p-5 text-[13px] text-stone">
          <p className="font-medium text-ivory">Transparent Creator & Referral Terms</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-ivory">85% Creator Allocation:</strong> You keep 85% of every eligible subscription,
              paid post, paid message unlock, and tip.
            </li>
            <li>
              <strong className="text-ivory">Your Earnings Are Never Reduced:</strong> {referrer.displayName} receives a
              direct referral reward equal to 10% of the 15% platform fee (1.5% of eligible purchases), funded strictly
              out of the platform&apos;s 15% commission.
            </li>
            <li>
              <strong className="text-ivory">Single-Level Only:</strong> Attribution is direct (1 level only) and must be
              confirmed during creator onboarding before paid monetization begins.
            </li>
            <li>
              <strong className="text-ivory">Country & Verification Eligibility:</strong> Paid monetization requires
              identity verification and residence in a supported payout jurisdiction. No level of earnings is guaranteed.
            </li>
          </ul>
        </div>

        <p className="mt-4 text-[13px] leading-relaxed text-ash">
          There is no open application form: the house sends your personal invitation link after{" "}
          {referrer.displayName} confirms this referral. This referral has been remembered on this device, so it will be
          attached automatically when you apply — you can also enter the code by hand on the application form.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/signin"
            className="inline-flex h-11 items-center justify-center rounded-full bg-gold px-6 text-[13px] font-medium text-ink transition hover:bg-gold-soft"
          >
            I already have an account — sign in
          </Link>
          <Link
            href={`/c/${referrer.handle}`}
            className="inline-flex h-11 items-center justify-center rounded-full border border-line-strong px-5 text-[13px] text-ivory hover:border-gold/50"
          >
            View {referrer.displayName}&apos;s Profile
          </Link>
        </div>
      </div>
    </main>
  );
}

