import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/layout/AuthShell";
import { Submit } from "@/components/forms";
import { getViewer } from "@/server/auth/request";
import { signOutAction } from "@/server/actions/auth";
import { VerifyForm } from "./VerifyForm";

export const metadata: Metadata = { title: "Two-step sign-in", robots: { index: false } };

export default async function VerifyPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/signin");
  if (viewer.mfa !== "pending") redirect("/discover");
  return (
    <AuthShell
      eyebrow={`Two-step sign-in · ${viewer.alias}`}
      title={
        <>
          One more <em className="text-metal">key.</em>
        </>
      }
      lede={<p>Enter the 6-digit code from your authenticator app. Lost your device? Use one of your recovery codes instead.</p>}
      study={{ hair: "bun", light: "left", tilt: -2, adorn: "crown", glow: 0.8 }}
    >
      <VerifyForm />
      <form action={signOutAction} className="mt-8">
        <Submit variant="quiet" className="px-0">Cancel and sign out</Submit>
      </form>
    </AuthShell>
  );
}
