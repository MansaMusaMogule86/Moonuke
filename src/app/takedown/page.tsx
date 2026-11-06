import type { Metadata } from "next";
import { AuthShell } from "@/components/layout/AuthShell";
import { TakedownForm } from "./TakedownForm";

export const metadata: Metadata = { title: "Report content", robots: { index: false } };

export default function TakedownPage() {
  return (
    <AuthShell
      eyebrow="Takedown notice"
      title={
        <>
          Report <em className="text-metal">content</em>
        </>
      }
      lede={
        <>
          <p>
            Use this form if intimate images of you were shared without your consent, if you appear in content and withdraw your consent, if
            someone is impersonating you, or to report child sexual abuse material. You don&apos;t need an account.
          </p>
          <p className="mt-4">
            We act on valid notices within 48 hours, including identical copies we know about. Filing a notice doesn&apos;t give you access
            to anything on the site, and we won&apos;t confirm what we find.
          </p>
          <p className="mt-4 text-[14px] text-ash">
            If a child is in immediate danger, contact your local emergency number first. In the US you can also report to NCMEC&apos;s CyberTipline.
          </p>
        </>
      }
      study={{ hair: "crop", light: "left", tilt: -2, adorn: "none", glow: 0.6 }}
    >
      <TakedownForm />
    </AuthShell>
  );
}
