import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/layout/AuthShell";
import { Submit } from "@/components/forms";
import { getViewer } from "@/server/auth/request";
import { signOutAction } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Awaiting approval", robots: { index: false } };

export default async function PendingPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/signin");
  if (viewer.status === "active") redirect("/discover");

  return (
    <AuthShell
      eyebrow={`Application · ${viewer.alias}`}
      title={
        <>
          The house is <em className="text-metal">reviewing.</em>
        </>
      }
      lede={
        <p>
          Thank you, {viewer.alias}. Every new account is approved personally. You&apos;ll be able to enter the
          Circle as soon as yours is — simply sign in again.
        </p>
      }
      study={{ hair: "bun", light: "right", tilt: 2, adorn: "collar", glow: 0.8 }}
    >
      <ol className="space-y-5 border-l border-line-strong pl-6 text-[14px]">
        <li className="relative">
          <span aria-hidden className="absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full bg-gold" />
          <p className="text-ivory">Invitation accepted</p>
        </li>
        <li className="relative">
          <span aria-hidden className="absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full border border-gold bg-ink" />
          <p className="text-ivory">Awaiting approval</p>
          <p className="text-stone">Usually reviewed within a few days.</p>
        </li>
        <li className="relative">
          <span aria-hidden className="absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full border border-line-strong bg-ink" />
          <p className="text-stone">Welcome to the Circle</p>
        </li>
      </ol>
      <form action={signOutAction} className="mt-10">
        <Submit variant="outline">Sign out</Submit>
      </form>
    </AuthShell>
  );
}
