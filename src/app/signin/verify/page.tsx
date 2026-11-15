import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/layout/AuthShell";
import { Submit } from "@/components/forms";
import { getViewer } from "@/server/auth/request";
import { signOutAction } from "@/server/actions/auth";
import { resolvePostLoginDestination } from "@/server/services/workspace";
import { VerifyForm } from "./VerifyForm";

export const metadata: Metadata = { title: "Two-step sign-in", robots: { index: false } };

export default async function VerifyPage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string }>;
}) {
  const { next } = searchParams ? await searchParams : {};
  const viewer = await getViewer();
  if (!viewer) redirect("/signin");
  if (viewer.mfa !== "pending") redirect(await resolvePostLoginDestination(viewer, next));
  return (
    <AuthShell
      eyebrow={`Two-step sign-in · ${viewer.alias}`}
      title={
        <>
          One more <em className="text-metal">step.</em>
        </>
      }
      lede={<p>Enter the 6-digit code from your authenticator app. Lost your device? Use one of your recovery codes instead.</p>}
    >
      <VerifyForm next={next} />
      <form action={signOutAction} className="mt-8">
        <Submit variant="quiet" className="px-0">Cancel and sign out</Submit>
      </form>
    </AuthShell>
  );
}
