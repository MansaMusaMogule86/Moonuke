import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ImportPanel } from "@/components/onboarding/ImportPanel";
import { Stepper } from "@/components/onboarding/Stepper";
import { CopyLink } from "@/components/studio/CopyLink";
import { StudioHeader } from "@/components/studio/StudioHeader";
import { Badge } from "@/components/ui/Badge";
import { requireViewer } from "@/server/auth/request";
import { featureEnabled } from "@/server/flags";
import { listCategories } from "@/server/services/club";
import { getOnboarding } from "@/server/services/creatorOnboarding";
import { myReferralCount } from "@/server/services/creatorReferral";
import { assistantInfo, myOnboarding, myProposals, mySocials, STAGES } from "@/server/services/onboarding";
import { ProfileEditor, ProposalCard, SocialsManager, VerificationForm } from "../StudioForms";

export const metadata: Metadata = { title: "Settings · Studio" };

const statusCopy = {
  not_started: ["Not started", "Save your profile, then confirm the statements below to request verification."],
  submitted: ["Submitted", "The house has your request. You may be contacted to complete identity checks."],
  in_review: ["In review", "The house is reviewing your verification."],
  needs_more_info: ["More information needed", "The house needs more from you — see the note below, then resubmit."],
  verified: ["Verified", "Your profile is live for members."],
  rejected: ["Not approved", "Verification wasn't approved. You can update your details and resubmit."],
} as const;

export default async function StudioSettingsPage() {
  const viewer = await requireViewer("club.discover");
  if (viewer.role !== "creator") notFound();
  const [ob, categories, onboarding, proposals, socials, referrals] = await Promise.all([
    getOnboarding(viewer),
    listCategories(viewer),
    myOnboarding(viewer),
    myProposals(viewer),
    mySocials(viewer),
    myReferralCount(viewer),
  ]);
  const referralsOpen = featureEnabled("creator_referrals");
  const handle = ob.profile?.handle;
  const [label, help] = statusCopy[ob.verification.status];
  const canSubmit = !!ob.profile && ["not_started", "needs_more_info", "rejected"].includes(ob.verification.status);
  const open = proposals.find((p) => p.status === "proposed");

  return (
    <div className="mx-auto max-w-[1000px] px-5 pb-28 pt-6 md:px-10 md:pt-8">
      <StudioHeader
        eyebrow="Studio"
        title="Settings"
        lede="Your profile, socials and verification. Members can't see your profile until the house verifies you and publishes it."
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-12">
        <section aria-labelledby="share-h" className="rounded-[var(--radius-xl)] border border-gold/30 bg-ink-2 p-6 md:p-8 lg:col-span-12">
          <h2 id="share-h" className="text-[18px] font-medium text-ivory">Your invite link</h2>
          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-stone">
            Share this link and new fans join through you — they land on your profile. You&apos;ll see how many joined.
            Open to fans only: it never creates a creator account.
          </p>
          {handle ? (
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              <code className="min-w-0 flex-1 truncate rounded-[var(--radius-sm)] bg-ink px-3 py-2.5 text-[13px] text-stone">{`https://www.divafans.io/join/${handle}`}</code>
              <CopyLink url={`https://www.divafans.io/join/${handle}`} label="Copy invite link" className="shrink-0" />
              <span className="shrink-0 text-[13px] text-ash"><span className="tabular-nums text-ivory">{referrals}</span> joined</span>
            </div>
          ) : (
            <p className="mt-5 text-[14px] text-ash">Save your profile (with a handle) and your invite link appears here.</p>
          )}
          {!referralsOpen && (
            <p className="mt-4 text-[13px] leading-relaxed text-ash">
              Creator invite links aren&apos;t switched on yet, so this link is not live. The house enables it.
            </p>
          )}
        </section>
      </div>

      <section aria-labelledby="progress-h" className="mt-8 rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 id="progress-h" className="text-[18px] font-medium text-ivory">Onboarding progress</h2>
          {onboarding.welcomeCallAt && !onboarding.stages.done.welcome && (
            <p className="text-[13px] text-gold-soft">Welcome call: {new Date(onboarding.welcomeCallAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</p>
          )}
        </div>
        <Stepper stages={STAGES} done={onboarding.stages.done} current={onboarding.stages.current} />
      </section>

      {open && (
        <section aria-label="Proposal from the house" className="mt-6">
          <ProposalCard p={open} current={ob.profile} />
        </section>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <section aria-labelledby="profile-h" className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-9 lg:col-span-7">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="profile-h" className="text-[18px] font-medium text-ivory">Profile</h2>
            <Badge tone={ob.profile?.published ? "vip" : "neutral"}>{ob.profile?.published ? "Published" : "Private draft"}</Badge>
          </div>
          <div className="mt-6">
            {/* Remount only when a house proposal was accepted (to load its values) — never on an ordinary save, which would drop the confirmation. */}
            <ProfileEditor key={proposals.find((p) => p.status === "accepted")?.id ?? "draft"} initial={ob.profile} categories={categories} assist={assistantInfo()} userId={viewer.id} />
          </div>
        </section>

        <div className="space-y-6 lg:col-span-5">
          <section aria-labelledby="import-h" className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-9">
            <h2 id="import-h" className="text-[18px] font-medium text-ivory">Import a profile</h2>
            <p className="mt-3 text-[14px] leading-relaxed text-stone">
              Bring your name, bio and links from another platform by pasting them or choosing an export file. You&apos;ll review everything before it&apos;s used.
            </p>
            <div className="mt-6">
              {open ? <p className="text-[14px] text-ash">Answer the proposal above first, then you can import.</p> : <ImportPanel targetUserId={viewer.id} audience="creator" />}
            </div>
          </section>

          <section aria-labelledby="socials-h" className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-9">
            <h2 id="socials-h" className="text-[18px] font-medium text-ivory">Social profiles</h2>
            <p className="mt-3 text-[14px] leading-relaxed text-stone">
              Optional, but it helps the house confirm who you are. Verified profiles can be shown on your page — your choice.
            </p>
            <div className="mt-6"><SocialsManager socials={socials} /></div>
          </section>

          <section aria-labelledby="verify-h" className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-9">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="verify-h" className="text-[18px] font-medium text-ivory">Verification</h2>
              <Badge tone={ob.verification.status === "verified" ? "vip" : ob.verification.status === "rejected" ? "live" : "neutral"}>{label}</Badge>
            </div>
            <p className="mt-3 text-[14px] leading-relaxed text-stone">{help}</p>
            {ob.verification.reviewNote && ob.verification.status !== "verified" && (
              <p className="mt-4 rounded-[var(--radius-md)] border border-gold/35 bg-gold/[0.06] px-4 py-3 text-[14px] text-gold-soft">Note from the house: {ob.verification.reviewNote}</p>
            )}
            <p className="mt-4 text-[12px] leading-relaxed text-ash">
              No identity-verification provider is connected yet. The house completes identity and age checks directly. We don&apos;t store ID documents, your legal name or date of birth in your profile.
            </p>
            {canSubmit ? <div className="mt-8"><VerificationForm /></div> : !ob.profile ? <p className="mt-8 text-[14px] text-ash">Save your profile first.</p> : null}
          </section>
        </div>
      </div>
    </div>
  );
}
