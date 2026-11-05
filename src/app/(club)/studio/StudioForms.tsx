"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { Check, FormMessage, Select, Submit, TextArea } from "@/components/forms";
import { AssistPanel, type AssistInfo } from "@/components/onboarding/AssistPanel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { idle } from "@/lib/forms";
import { saveProfileAction, submitVerificationAction } from "@/server/actions/creators";
import { addSocialAction, decideProposalAction, socialSettingAction } from "@/server/actions/onboarding";
import type { ProfileInput } from "@/server/services/creatorOnboarding";
import type { ProposalRow, SocialRow } from "@/server/services/onboarding";

type Cat = { slug: string; label: string };

/** Profile draft + assistant. The assistant only fills fields; saving is the creator's explicit action. */
export function ProfileEditor({ initial, categories, assist, userId }: { initial: (ProfileInput & { published: boolean }) | null; categories: Cat[]; assist: AssistInfo; userId: string }) {
  const [state, action] = useActionState(saveProfileAction, idle);
  const v = (k: keyof ProfileInput) => state.values?.[k] ?? (initial?.[k] as string | undefined) ?? "";
  const [tagline, setTagline] = useState(v("tagline"));
  const [bio, setBio] = useState(v("bio"));
  const [fromAssistant, setFromAssistant] = useState(false);

  return (
    <div className="space-y-6">
      <AssistPanel
        info={assist}
        targetUserId={userId}
        defaults={{ displayName: v("displayName"), discipline: v("discipline"), city: v("city") }}
        onUse={(x) => {
          if (x.tagline !== undefined) setTagline(x.tagline);
          if (x.bio !== undefined) setBio(x.bio);
          setFromAssistant(true);
        }}
      />
      <form action={action} className="space-y-7" noValidate>
        <FormMessage state={state} />
        <div className="grid gap-7 sm:grid-cols-2">
          <Field label="Handle" name="handle" defaultValue={v("handle")} required maxLength={24} hint="Your profile address: /c/handle" error={state.fields?.handle} />
          <Field label="Display name" name="displayName" defaultValue={v("displayName")} required maxLength={60} error={state.fields?.displayName} />
          <Field label="Discipline" name="discipline" defaultValue={v("discipline")} required maxLength={60} placeholder="Photographer" error={state.fields?.discipline} />
          <Select label="Category" name="category" defaultValue={v("category") || categories[0]?.slug} error={state.fields?.category}>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>{c.label}</option>
            ))}
          </Select>
          <Field label="City (optional)" name="city" defaultValue={v("city")} maxLength={60} />
          <Select label="Visibility once published" name="visibility" defaultValue={v("visibility") || "listed"}>
            <option value="listed">Listed — appears in discovery</option>
            <option value="discreet">Discreet — reachable by link only</option>
            <option value="private">Private — current members only</option>
          </Select>
        </div>
        <Field label="Tagline (optional)" name="tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={160} />
        <TextArea label="About (optional)" name="bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={5} maxLength={2000} hint={fromAssistant ? "Includes assistant suggestions — review before saving." : undefined} />
        <Submit>Save profile</Submit>
      </form>
    </div>
  );
}

const FIELD_LABEL: Record<string, string> = { handle: "Handle", displayName: "Display name", discipline: "Discipline", category: "Category", city: "City", tagline: "Tagline", bio: "About", visibility: "Visibility" };

/** A proposal from the house. Shows exactly what would change; only the creator decides. */
export function ProposalCard({ p, current }: { p: ProposalRow; current: Partial<ProfileInput> | null }) {
  const [state, action] = useActionState(decideProposalAction, idle);
  const router = useRouter();
  const decided = state.data?.decided;
  const { links = [], ...profileFields } = p.fields;
  const entries = Object.entries(profileFields) as [keyof ProfileInput, string][];
  const imported = p.source === "import";
  return (
    <article aria-label={imported ? "Imported profile proposal" : "Profile proposal from the house"} className="rounded-[var(--radius-xl)] border border-gold/40 bg-ink-3 p-6 md:p-8">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-[26px] text-ivory">{imported ? "Imported details to review" : "The house prepared a draft"}</h3>
        {imported && <Badge tone="neutral">Import</Badge>}
        {p.ai_assisted && <Badge tone="neutral">Assistant-drafted</Badge>}
        {decided && <Badge tone={decided === "accepted" ? "vip" : "locked"}>{decided}</Badge>}
      </div>
      {p.message && <p className="mt-3 text-[14px] italic text-ivory/85">“{p.message}”</p>}
      <dl className="mt-5 divide-y divide-line border-y border-line">
        {entries.map(([k, val]) => (
          <div key={k} className="grid gap-1 py-3 sm:grid-cols-4">
            <dt className="text-[12px] uppercase tracking-[0.16em] text-ash">{FIELD_LABEL[k] ?? k}</dt>
            <dd className="sm:col-span-3">
              {current?.[k] && current[k] !== val && <p className="text-[13px] text-ash line-through">{String(current[k])}</p>}
              <p className="text-[14px] text-ivory">{val}</p>
            </dd>
          </div>
        ))}
        {links.length > 0 && (
          <div className="grid gap-1 py-3 sm:grid-cols-4">
            <dt className="text-[12px] uppercase tracking-[0.16em] text-ash">Social profiles</dt>
            <dd className="sm:col-span-3">
              <ul className="space-y-1">
                {links.map((l) => (
                  <li key={`${l.platform}:${l.handle}`} className="break-all text-[14px] text-ivory">
                    {PLATFORM_OPTIONS.find(([v]) => v === l.platform)?.[1] ?? l.platform} · {l.platform === "website" ? l.url : `@${l.handle}`}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[12px] text-ash">Added as unverified — you&apos;ll still place a proof code in each bio.</p>
            </dd>
          </div>
        )}
      </dl>
      {!decided ? (
        <form action={action} className="mt-6 flex flex-wrap gap-3">
          <input type="hidden" name="id" value={p.id} />
          <Submit name="decision" value="accept">{entries.length ? "Accept and update my draft" : "Accept and add these profiles"}</Submit>
          <Submit name="decision" value="decline" variant="outline">Decline</Submit>
        </form>
      ) : (
        <Button size="sm" variant="outline" className="mt-6" onClick={() => router.refresh()}>
          View my updated draft
        </Button>
      )}
      <FormMessage state={state} className="mt-4" />
      <p className="mt-4 text-[12px] text-ash">Accepting updates your private draft only. You can still edit everything before verification.</p>
    </article>
  );
}

const PLATFORM_OPTIONS = [
  ["instagram", "Instagram"],
  ["tiktok", "TikTok"],
  ["x", "X"],
  ["youtube", "YouTube"],
  ["twitch", "Twitch"],
  ["threads", "Threads"],
  ["website", "Website"],
] as const;

export function SocialsManager({ socials }: { socials: SocialRow[] }) {
  const [state, action] = useActionState(addSocialAction, idle);
  return (
    <div className="space-y-6">
      {socials.length > 0 && (
        <ul className="divide-y divide-line border-y border-line">
          {socials.map((s) => (
            <SocialItem key={s.id} s={s} />
          ))}
        </ul>
      )}
      <form action={action} className="space-y-5" noValidate>
        <FormMessage state={state} />
        <div className="grid gap-5 sm:grid-cols-3">
          <Select label="Platform" name="platform" defaultValue={state.values?.platform ?? "instagram"}>
            {PLATFORM_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
          <Field label="Social handle" name="handle" defaultValue={state.values?.handle} placeholder="yourname" error={state.fields?.handle} />
          <Field label="Link (optional)" name="url" defaultValue={state.values?.url} placeholder="https://…" error={state.fields?.url} hint="Required for websites." />
        </div>
        <Submit variant="outline">Add profile</Submit>
      </form>
    </div>
  );
}

function SocialItem({ s }: { s: SocialRow }) {
  const [state, action] = useActionState(socialSettingAction, idle);
  const tone = s.status === "verified" ? "vip" : s.status === "failed" ? "live" : "neutral";
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[15px] text-ivory">{PLATFORM_OPTIONS.find(([v]) => v === s.platform)?.[1]} · @{s.handle}</p>
            <Badge tone={tone}>{s.status}</Badge>
          </div>
          <p className="mt-1 break-all text-[12px] text-ash">{s.url}</p>
        </div>
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={s.id} />
          {s.status === "verified" && (
            <>
              <input type="hidden" name="show" value={String(!s.show_on_profile)} />
              <Submit variant="ghost" className="h-9 px-3 text-[13px]">{s.show_on_profile ? "Hide from profile" : "Show on profile"}</Submit>
            </>
          )}
          <Submit name="intent" value="remove" variant="quiet" className="h-9 px-3 text-[13px]">
            Remove<span className="sr-only"> {s.platform} {s.handle}</span>
          </Submit>
        </form>
      </div>
      {s.status !== "verified" && (
        <p className="mt-3 rounded-[var(--radius-md)] border border-line bg-ink/40 px-4 py-3 text-[13px] text-stone">
          To confirm it&apos;s yours, add <code data-testid="proof-code" className="text-gold-soft">{s.proof_code}</code> to that profile&apos;s bio. The house will check it and may remove it from consideration if it can&apos;t be confirmed. You can delete the code once verified.
        </p>
      )}
      {state.status === "error" && <p role="alert" className="mt-2 text-[12px] text-danger">{state.message}</p>}
    </li>
  );
}

export function VerificationForm() {
  const [state, action] = useActionState(submitVerificationAction, idle);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <Check name="age" error={state.fields?.age}>I am 18 or older, and I&apos;ll provide proof of age when the house asks.</Check>
      <Check name="identity" error={state.fields?.identity}>I am the person this profile represents, and I&apos;ll verify my identity when asked.</Check>
      <Check name="consent" error={state.fields?.consent}>Everyone who appears in my content is 18+, has consented, and I keep the records the law requires.</Check>
      <Check name="terms" error={state.fields?.terms}>I accept the creator terms and house rules.</Check>
      <Submit className="w-full">Request verification</Submit>
    </form>
  );
}
