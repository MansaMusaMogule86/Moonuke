import type { Metadata } from "next";
import { AuthShell } from "@/components/layout/AuthShell";

export const metadata: Metadata = { title: "Not available", robots: { index: false } };

export default function UnavailablePage() {
  return (
    <AuthShell eyebrow="Access" title={<>Not available <em className="text-metal">here</em></>} study={{ hair: "bun", light: "right", tilt: 2, adorn: "none", glow: 0.5 }}>
      <p className="text-[15px] leading-relaxed text-stone">This service isn&apos;t available where you are. Your account and anything you&apos;ve bought are unaffected.</p>
    </AuthShell>
  );
}
