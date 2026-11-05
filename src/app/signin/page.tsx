import { brand } from "@/config/brand";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/layout/AuthShell";
import { getViewer } from "@/server/auth/request";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function SignInPage() {
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
      <SignInForm />
    </AuthShell>
  );
}
