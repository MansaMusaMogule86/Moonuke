import Link from "next/link";
import { notFound } from "next/navigation";
import { Stepper } from "@/components/onboarding/Stepper";
import { Badge } from "@/components/ui/Badge";
import { requireViewer } from "@/server/auth/request";
import { listCategories } from "@/server/services/club";
import { assistantInfo, caseDetail, STAGES } from "@/server/services/onboarding";
import { CaseNotesForm, ProposalComposer, SocialReviewForm } from "./OnboardingForms";

/** Owner workspace for one creator (shared by /case/[id] and /creator/[userId]). */
export async function CaseView({ caseId, userId }: { caseId?: string; userId?: string }) {
  const owner = await requireViewer("creators.verify");
  const [d, categories] = await Promise.all([caseDetail(owner, { caseId, userId }), listCategories(owner)]);
  if (!d) notFound();
  const name = d.profile?.displayName ?? d.case?.name ?? d.user?.alias ?? "Creator";
  const open = d.proposals.find((p) => p.status === "proposed");

  return (
    <div>
      <Link href="/admin/onboarding" className="text-[13px] text-stone underline decoration-line-strong underline-offset-4 hover:text-ivory">← Onboarding</Link>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-[40px] leading-none text-ivory md:text-[56px]">{name}</h1>
        {d.case && <Badge tone="vip">White-glove</Badge>}
        {d.user && <Badge tone={d.user.status === "active" ? "member" : "neutral"}>{d.user.status}</Badge>}
        {d.verification && <Badge tone={d.verification === "verified" ? "vip" : "neutral"}>verification: {d.verification.replace(/_/g, " ")}</Badge>}
      </div>
      <p className="mt-2 break-all text-[13px] text-stone">{d.user?.email ?? d.case?.email}{d.profile?.handle ? ` · /c/${d.profile.handle}` : ""}</p>
      <div className="mt-8 rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6">
        <Stepper stages={STAGES} done={d.stages.done} current={d.stages.current} />
        <p className="mt-4 text-[13px] text-stone">
          {!d.user && "Waiting for them to open the invitation and apply."}
          {d.user?.status === "pending" && <>Their application is waiting — <Link className="text-gold underline decoration-gold/40 underline-offset-4" href="/admin">approve it in Applications</Link>.</>}
          {d.verification && ["submitted", "in_review"].includes(d.verification) && <>Verification submitted — <Link className="text-gold underline decoration-gold/40 underline-offset-4" href="/admin/creators">review in Creators</Link>.</>}
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          <section aria-labelledby="prep-h" className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-8">
            <h2 id="prep-h" className="font-display text-[28px] text-ivory">Prepare their profile</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-stone">
              Send a draft for the creator to accept. Their live profile never changes until they do.
              {open ? " A newer draft replaces the one they haven't answered yet." : ""}
            </p>
            {d.user && d.user.status === "active" ? (
              <div className="mt-6">
                <ProposalComposer userId={d.user.id} current={d.profile} categories={categories} assist={assistantInfo()} />
              </div>
            ) : (
              <p className="mt-6 text-[14px] text-ash">Available once their account is approved.</p>
            )}
            {d.proposals.length > 0 && (
              <div className="mt-8 border-t border-line pt-6">
                <h3 className="eyebrow mb-3 text-stone">Draft history</h3>
                <ul className="space-y-2 text-[13px]">
                  {d.proposals.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-2">
                      <Badge tone={p.status === "accepted" ? "vip" : p.status === "proposed" ? "member" : "locked"}>{p.status}</Badge>
                      <span className="text-stone">{Object.keys(p.fields).join(", ")}</span>
                      {p.ai_assisted && <span className="text-ash">· assistant</span>}
                      <span className="text-ash">· {new Date(p.created_at).toLocaleDateString("en-GB")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6 lg:col-span-5">
          {d.case && (
            <section aria-labelledby="case-h" className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-8">
              <h2 id="case-h" className="font-display text-[24px] text-ivory">Concierge</h2>
              <p className="mt-2 text-[12px] text-ash">Notes are visible only to the house.</p>
              <div className="mt-5"><CaseNotesForm c={d.case} /></div>
            </section>
          )}
          <section aria-labelledby="soc-h" className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-8">
            <h2 id="soc-h" className="font-display text-[24px] text-ivory">Social profiles</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-stone">Open each link and check the proof code appears in the bio before verifying.</p>
            {d.socials.length === 0 ? (
              <p className="mt-5 text-[14px] text-ash">None added yet.</p>
            ) : (
              <ul className="mt-5 divide-y divide-line border-y border-line">
                {d.socials.map((s) => (
                  <li key={s.id} className="py-4">
                    <SocialReviewForm s={s} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
