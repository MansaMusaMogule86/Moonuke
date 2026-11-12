import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/Button";
import { getViewer } from "@/server/auth/request";
import { featureEnabled } from "@/server/flags";
import { referralCreator } from "@/server/services/creatorReferral";
import { SignupForm } from "./SignupForm";

// Canonical fan sign-up. It ONLY works with a valid creator referral: the handle
// is validated on the server, so a hand-edited ?creator= value cannot create an
// account (there is no generic sign-up route).
export const metadata: Metadata = { title: "Join DivaFans", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ creator?: string }> }) {
  const { creator: handle } = await searchParams;
  const viewer = await getViewer();
  if (viewer) redirect(viewer.status === "active" ? "/discover" : "/pending");

  const creator = handle && featureEnabled("creator_referrals") ? await referralCreator(handle) : null;

  if (!creator) {
    return (
      <AuthShell
        eyebrow="Sign up"
        title={<>An invitation from a <em className="text-metal">creator</em> is required.</>}
        lede={
          <p>
            DivaFans is invitation-only — there is no open sign-up. Open the personal link a creator shared with you,
            or ask a member to request an invitation for you.
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
      eyebrow={`Join · ${creator.displayName}`}
      title={<>Create your <em className="text-metal">fan account.</em></>}
      lede={
        <p>
          You&apos;re joining through {creator.displayName}&apos;s link. Choose the name creators will see; your email
          stays private and is used for sign-in and receipts only.
        </p>
      }
    >
      <SignupForm handle={creator.handle} displayName={creator.displayName} />
    </AuthShell>
  );
}
