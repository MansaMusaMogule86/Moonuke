import type { Metadata } from "next";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/Button";
import { requestMeta } from "@/server/auth/request";
import { isAppError } from "@/server/errors";
import { inspectInvitation } from "@/server/services/accounts";
import { hit, LIMITS } from "@/server/services/rateLimit";
import { ApplyForm } from "./ApplyForm";

// The token is a credential: never index it, never leak it in a Referer.
export const metadata: Metadata = { title: "Your invitation", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const meta = await requestMeta();

  let limited = false;
  try {
    await hit(`invite:view:${meta.ipHash ?? "unknown"}`, LIMITS.inviteView);
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
            This door is <em className="text-metal">closed.</em>
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
          Choose the alias the Circle will know you by. Your email stays private. After you apply, the house
          reviews every request personally — your account opens once approved.
        </p>
      }
    >
      <ApplyForm token={token} emailLocked={invitation.emailLocked} role={invitation.role} />
    </AuthShell>
  );
}
