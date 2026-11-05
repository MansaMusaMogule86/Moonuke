import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Stepper } from "@/components/onboarding/Stepper";
import { Badge } from "@/components/ui/Badge";
import { requireViewer } from "@/server/auth/request";
import { listCategories } from "@/server/services/club";
import { getOnboarding } from "@/server/services/creatorOnboarding";
import { assistantInfo, myOnboarding, myProposals, mySocials, STAGES } from "@/server/services/onboarding";
import { ProfileEditor, ProposalCard, SocialsManager, VerificationForm } from "./StudioForms";

export const metadata: Metadata = { title: "Studio" };

const statusCopy = {
  not_started: ["Not started", "Save your profile, then confirm the statements below to request verification."],
  submitted: ["Submitted", "The house has your request. You may be contacted to complete identity checks."],
  in_review: ["In review", "The house is reviewing your verification."],
  needs_more_info: ["More information needed", "The house needs more from you — see the note below, then resubmit."],
  verified: ["Verified", "Your profile is live for members."],
  rejected: ["Not approved", "Verification wasn't approved. You can update your details and resubmit."],
} as const;

export default async function StudioPage() {
  const viewer = await requireViewer("club.discover");
  if (viewer.role !== "creator") notFound();
  const [ob, categories, onboarding, proposals, socials] = await Promise.all([
    getOnboarding(viewer),
    listCategories(viewer),
    myOnboarding(viewer),
    myProposals(viewer),
    mySocials(viewer),
  ]);
  const [label, help] = statusCopy[ob.verification.status];
  const canSubmit = !!ob.profile && ["not_started", "needs_more_info", "rejected"].includes(ob.verification.status);
  const open = proposals.find((p) => p.status === "proposed");

  return (
    <div className="mx-auto max-w-[1200px] px-5 pb-28 pt-14 md:px-10 md:pt-20">
      <p className="eyebrow mb-5">Studio · {viewer.alias}{onboarding.whiteGlove ? " · White-glove" : ""}</p>
      <h1 className="font-display text-[52px] leading-[0.98] tracking-[-0.03em] text-ivory md:text-[84px]">
        Your <em className="text-metal">room.</em>
      </h1>
      <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-stone">
        {onboarding.whiteGlove
          ? "The house is preparing your room with you. Review anything we draft, connect your socials, then request verification."
          : "Set up your profile and request verification. Members can't see your profile until the house verifies you and publishes it."}
      </p>

      <section aria-labelledby="progress-h" className="mt-10 rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 id="progress-h" className="font-display text-[24px] text-ivory">Your progress</h2>
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
            <h2 id="profile-h" className="font-display text-[30px] text-ivory">Profile</h2>
            <Badge tone={ob.profile?.published ? "vip" : "neutral"}>{ob.profile?.published ? "Published" : "Private draft"}</Badge>
          </div>
          <div className="mt-8">
            <ProfileEditor key={JSON.stringify(ob.profile)} initial={ob.profile} categories={categories} assist={assistantInfo()} userId={viewer.id} />
          </div>
        </section>

        <div className="space-y-6 lg:col-span-5">
          <section aria-labelledby="socials-h" className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-9">
            <h2 id="socials-h" className="font-display text-[30px] text-ivory">Social profiles</h2>
            <p className="mt-3 text-[14px] leading-relaxed text-stone">
              Optional, but it helps the house confirm who you are. Verified profiles can be shown on your page — your choice.
            </p>
            <div className="mt-6"><SocialsManager socials={socials} /></div>
          </section>

          <section aria-labelledby="verify-h" className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-9">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="verify-h" className="font-display text-[30px] text-ivory">Verification</h2>
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
