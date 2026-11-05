import { brand } from "@/config/brand";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/layout/AuthShell";
import { getViewer } from "@/server/auth/request";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const { reset } = await searchParams;
  const viewer = await getViewer();
  if (viewer) redirect(viewer.status === "active" ? "/discover" : "/pending");
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
          {brand.name} is by invitation only. New here? Open the personal link you were sent — or ask a member to
          request an invitation for you.
        </p>
      }
    >
      {reset === "1" && (
        <p role="status" className="mb-8 rounded-[var(--radius-md)] border border-gold/35 bg-gold/[0.06] px-4 py-3 text-[14px] text-gold-soft">
          Your password was changed and every session was signed out. Sign in with the new password.
        </p>
      )}
      <SignInForm />
      <p className="mt-8 text-[14px] text-stone">
        <Link href="/forgot" className="text-gold underline decoration-gold/40 underline-offset-4 hover:decoration-gold">Forgot your password?</Link>
      </p>
    </AuthShell>
  );
}
