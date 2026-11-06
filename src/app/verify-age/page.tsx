import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AuthShell } from "@/components/layout/AuthShell";
import { requireViewer } from "@/server/auth/request";
import { featureEnabled } from "@/server/flags";
import { myAgeStatus } from "@/server/services/access";
import { StartAgeCheck } from "./StartAgeCheck";

export const metadata: Metadata = { title: "Confirm your age", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function VerifyAgePage() {
  // Not reachable until age assurance is approved and switched on.
  if (!featureEnabled("age_assurance")) notFound();
  const viewer = await requireViewer();
  const status = await myAgeStatus(viewer);
  return (
    <AuthShell eyebrow="Age check" title={<>Confirm your <em className="text-metal">age</em></>} study={{ hair: "wrap", light: "left", tilt: -2, adorn: "none", glow: 0.6 }}>
      {status.passed ? (
        <p role="status" className="text-[15px] text-ivory">You&apos;re verified. You can continue to the club.</p>
      ) : (
        <div className="space-y-5 text-[15px] leading-relaxed text-stone">
          <p>The law where you are requires a reliable age check before you can see adult content. An approved provider carries it out; we only keep the result (passed or not), never your documents or date of birth.</p>
          {status.lastStatus === "failed" && <p role="alert" className="text-danger">Your last check didn&apos;t pass. You can try again.</p>}
          <StartAgeCheck />
        </div>
      )}
    </AuthShell>
  );
}
