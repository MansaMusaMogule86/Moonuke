import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { requireViewer } from "@/server/auth/request";
import { listCategories } from "@/server/services/club";
import { getOnboarding } from "@/server/services/creatorOnboarding";
import { ProfileForm, VerificationForm } from "./StudioForms";

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
  const [ob, categories] = await Promise.all([getOnboarding(viewer), listCategories(viewer)]);
  const [label, help] = statusCopy[ob.verification.status];
  const canSubmit = !!ob.profile && ["not_started", "needs_more_info", "rejected"].includes(ob.verification.status);

  return (
    <div className="mx-auto max-w-[1200px] px-5 pb-28 pt-14 md:px-10 md:pt-20">
      <p className="eyebrow mb-5">Studio · {viewer.alias}</p>
      <h1 className="font-display text-[52px] leading-[0.98] tracking-[-0.03em] text-ivory md:text-[84px]">
        Your <em className="text-metal">room.</em>
      </h1>
      <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-stone">
        Set up your profile and request verification. Members can&apos;t see your profile until the house verifies you
        and publishes it. Publishing, tiers and content tools arrive in the full studio.
      </p>

      <div className="mt-12 grid gap-6 lg:grid-cols-12">
        <section aria-labelledby="profile-h" className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-9 lg:col-span-7">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="profile-h" className="font-display text-[30px] text-ivory">1 · Profile</h2>
            <Badge tone={ob.profile?.published ? "vip" : "neutral"}>{ob.profile?.published ? "Published" : "Private draft"}</Badge>
          </div>
          <div className="mt-8">
            <ProfileForm initial={ob.profile} categories={categories} />
          </div>
        </section>

        <section aria-labelledby="verify-h" className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-9 lg:col-span-5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="verify-h" className="font-display text-[30px] text-ivory">2 · Verification</h2>
            <Badge tone={ob.verification.status === "verified" ? "vip" : ob.verification.status === "rejected" ? "live" : "neutral"}>{label}</Badge>
          </div>
          <p className="mt-3 text-[14px] leading-relaxed text-stone">{help}</p>
          {ob.verification.reviewNote && ob.verification.status !== "verified" && (
            <p className="mt-4 rounded-[var(--radius-md)] border border-gold/35 bg-gold/[0.06] px-4 py-3 text-[14px] text-gold-soft">
              Note from the house: {ob.verification.reviewNote}
            </p>
          )}
          <p className="mt-4 text-[12px] leading-relaxed text-ash">
            No identity-verification provider is connected yet. The house completes identity and age checks directly.
            We don&apos;t store ID documents, your legal name or date of birth in your profile.
          </p>
          {canSubmit ? (
            <div className="mt-8"><VerificationForm /></div>
          ) : !ob.profile ? (
            <p className="mt-8 text-[14px] text-ash">Save your profile first.</p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
