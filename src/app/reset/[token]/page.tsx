import type { Metadata } from "next";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/Button";
import { inspectResetToken } from "@/server/services/recovery";
import { ResetForm } from "./ResetForm";

// The token is a credential: never index it, never leak it in a Referer.
export const metadata: Metadata = { title: "Choose a new password", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = await inspectResetToken(token);
  return (
    <AuthShell
      eyebrow="Account recovery"
      title={
        valid ? (
          <>
            A new <em className="text-metal">key.</em>
          </>
        ) : (
          <>
            This link has <em className="text-metal">expired.</em>
          </>
        )
      }
      lede={
        <p>
          {valid
            ? "Choose a new password. Every signed-in session will be signed out, and two-step sign-in (if enabled) is still required."
            : "Reset links work once and expire after 30 minutes. Request a new one to continue."}
        </p>
      }
      study={{ hair: "crop", light: "right", tilt: 2, adorn: "none", glow: 0.7 }}
    >
      {valid ? <ResetForm token={token} /> : <Button href="/forgot" variant="outline">Request a new link</Button>}
    </AuthShell>
  );
}
