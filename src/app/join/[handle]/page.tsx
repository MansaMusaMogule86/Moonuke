import type { Metadata } from "next";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/Button";
import { Portrait } from "@/components/ui/Portrait";
import { featureEnabled } from "@/server/flags";
import { referralCreator } from "@/server/services/creatorReferral";

// Public referral landing. No session required; the creator is resolved on the
// server so a tampered handle can never widen access.
export const metadata: Metadata = { title: "Join DivaFans", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function JoinPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const creator = featureEnabled("creator_referrals") ? await referralCreator(handle) : null;

  if (!creator) {
    return (
      <AuthShell
        eyebrow="Invitation"
        title={<>Joining is by <em className="text-metal">invitation.</em></>}
        lede={
          <p>
            This invite link isn&apos;t available. It may belong to a creator who hasn&apos;t published their profile
            yet, or who has paused new fans. Ask them for a current link — or sign in if you already have an account.
          </p>
        }
      >
        <div className="flex flex-wrap gap-3">
          <Button href="/signin" variant="outline">I already have an account</Button>
          <Button href="/" variant="ghost">Back home</Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow={`Invitation · ${creator.discipline}${creator.city ? ` · ${creator.city}` : ""}`}
      title={<>Join <em className="text-metal">{creator.displayName}</em> on DivaFans.</>}
      lede={
        <p>
          {creator.tagline ??
            "Create your free fan account, follow the creators you love, and join a membership only when you're ready."}
        </p>
      }
    >
      <div className="flex items-center gap-4 rounded-[var(--radius-lg)] border border-line bg-ink-2 p-4">
        <Portrait alt="" study={creator.cover} className="arch h-20 w-16 shrink-0" sizes="80px" />
        <div className="min-w-0">
          <p className="truncate font-display text-[22px] leading-tight text-ivory">{creator.displayName}</p>
          <p className="mt-1 text-[12px] uppercase tracking-[0.18em] text-ash">Invited by this creator</p>
        </div>
      </div>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button href={`/signup?creator=${encodeURIComponent(creator.handle)}`} size="lg" arrow className="w-full sm:w-auto">
          Join as a fan
        </Button>
        <Button href="/signin" size="lg" variant="outline" className="w-full sm:w-auto">
          I already have an account
        </Button>
      </div>
      <p className="mt-6 text-[13px] leading-relaxed text-ash">
        Free to join. Follow creators and read their public posts; memberships are optional. Accounts are for people
        aged 18 and over.
      </p>
    </AuthShell>
  );
}
