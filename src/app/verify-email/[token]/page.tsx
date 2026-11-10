import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/layout/AuthShell";
import { readEmailVerificationToken } from "@/server/services/emailVerification";
import { ConfirmEmailForm } from "./ConfirmEmailForm";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false, follow: false } };

export default async function VerifyEmailPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Reading the link changes nothing; only the button's POST confirms.
  const valid = readEmailVerificationToken(token) !== null;
  return valid ? (
    <AuthShell eyebrow="Your account" title={<>Confirm your <em className="text-metal">email.</em></>} lede={<p>Confirm that this email address belongs to you. Your account still opens only after our team approves it.</p>}>
      <ConfirmEmailForm token={token} />
    </AuthShell>
  ) : (
    <AuthShell eyebrow="Your account" title={<>This link has <em className="text-metal">expired.</em></>} lede={<p>Confirmation links last 7 days. Your account isn&apos;t affected.</p>}>
      <Link href="/signin" className="text-[14px] text-gold-soft underline underline-offset-4">Go to sign in</Link>
    </AuthShell>
  );
}
