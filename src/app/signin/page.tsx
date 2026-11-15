import { brand } from "@/config/brand";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/layout/AuthShell";
import { getViewer } from "@/server/auth/request";
import { resolvePostLoginDestination } from "@/server/services/workspace";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; activated?: string; next?: string }>;
}) {
  const { reset, activated, next } = await searchParams;
  const viewer = await getViewer();
  if (viewer) redirect(await resolvePostLoginDestination(viewer, next));
  return (
    <AuthShell
      eyebrow="Members & creators"
      title={
        <>
          Welcome <em className="text-metal">back.</em>
        </>
      }
      lede={
        <p>
          New here? {brand.name} is invitation-only for now. Open the personal link you were sent to create your
          account, or ask a member to request an invitation for you.
        </p>
      }
    >
      {activated === "1" && (
        <p role="status" className="mb-8 rounded-[var(--radius-md)] border border-gold/35 bg-gold/[0.06] px-4 py-3 text-[14px] text-gold-soft">
          Your creator account is active. Sign in with your new password; you&apos;ll set up two-step sign-in next.
        </p>
      )}
      {reset === "1" && (
        <p role="status" className="mb-8 rounded-[var(--radius-md)] border border-gold/35 bg-gold/[0.06] px-4 py-3 text-[14px] text-gold-soft">
          Your password was changed and every session was signed out. Sign in with the new password.
        </p>
      )}
      <SignInForm next={next} />
      <p className="mt-8 text-[14px] text-stone">
        <Link href="/forgot" className="text-gold underline decoration-gold/40 underline-offset-4 hover:decoration-gold">Forgot your password?</Link>
      </p>
    </AuthShell>
  );
}
