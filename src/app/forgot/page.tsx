import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/layout/AuthShell";
import { ForgotForm } from "./ForgotForm";

export const metadata: Metadata = { title: "Reset password", robots: { index: false } };

export default function ForgotPage() {
  return (
    <AuthShell
      eyebrow="Account recovery"
      title={
        <>
          Forgotten <em className="text-metal">the key?</em>
        </>
      }
      lede={<p>Enter the email on your account. If it matches, we&apos;ll send a single-use link that expires in 30 minutes.</p>}
      study={{ hair: "crop", light: "right", tilt: 2, adorn: "none", glow: 0.7 }}
    >
      <ForgotForm />
      <p className="mt-8 text-[14px] text-stone">
        Remembered it? <Link href="/signin" className="text-gold underline decoration-gold/40 underline-offset-4 hover:decoration-gold">Sign in</Link>
      </p>
    </AuthShell>
  );
}
