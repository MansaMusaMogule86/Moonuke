import { cookies } from "next/headers";
import type { Metadata } from "next";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/Button";
import { RECRUIT_COOKIE } from "@/server/auth/request";
import { requestMeta } from "@/server/auth/request";
import { isAppError } from "@/server/errors";
import { inspectInvitation } from "@/server/services/accounts";
import { hitIp, LIMITS } from "@/server/services/rateLimit";
import { ActivateForm } from "./ActivateForm";
import { ApplyForm } from "./ApplyForm";

// The token is a credential: never index it, never leak it in a Referer.
export const metadata: Metadata = { title: "Your invitation", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const meta = await requestMeta();

  let limited = false;
  try {
    await hitIp("invite:view", meta.ipHash, LIMITS.inviteView);
  } catch (e) {
    if (!isAppError(e)) throw e;
    limited = true;
  }
  const invitation = limited ? null : await inspectInvitation(token);

  if (!invitation) {
    return (
      <AuthShell
        eyebrow="Invitation"
        title={
          <>
            This invitation is <em className="text-metal">closed.</em>
          </>
        }
        lede={
          <p>
            {limited
              ? "Too many attempts from this connection. Please wait a few minutes and try again."
              : "This invitation is no longer valid. It may have expired, been used, or been withdrawn. Ask the person who invited you to request a new one."}
          </p>
        }
      >
        <Button href="/signin" variant="outline">
          I already have an account
        </Button>
      </AuthShell>
    );
  }

  const roleLabel = invitation.role === "creator" ? "creator" : "member";
  if (invitation.activation) {
    return (
      <AuthShell
        eyebrow="Invitation · creator"
        title={<>Activate your <em className="text-metal">creator account.</em></>}
        lede={
          <p>
            Creator accounts are by invitation only. Enter the temporary password you were given separately, then
            choose your own. Next you&apos;ll sign in and set up two-step sign-in before your studio opens.
          </p>
        }
      >
        <ActivateForm token={token} />
      </AuthShell>
    );
  }
  return (
    <AuthShell
      eyebrow={`Invitation · ${roleLabel}`}
      title={
        <>
          You&apos;ve been <em className="text-metal">invited.</em>
        </>
      }
      lede={
        <p>
          Choose the name creators will see. Your email stays private. After you apply, our team reviews your
          request, and your account opens once it&apos;s approved.
        </p>
      }
    >
      <ApplyForm token={token} emailLocked={invitation.emailLocked} role={invitation.role} recruitCode={(await cookies()).get(RECRUIT_COOKIE)?.value ?? null} />
    </AuthShell>
  );
}
