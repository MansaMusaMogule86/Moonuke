import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AuthShell } from "@/components/layout/AuthShell";
import { requireViewer } from "@/server/auth/request";
import { env, isProd } from "@/server/env";
import { featureEnabled } from "@/server/flags";
import { uuid } from "@/server/validation";
import { MockAgeForm } from "./MockAgeForm";

export const metadata: Metadata = { title: "Test age provider", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Stands in for a vendor's page in local tests only. */
export default async function MockAgePage({ searchParams }: { searchParams: Promise<{ check?: string }> }) {
  if (isProd() || env().AGE_PROVIDER !== "mock" || !featureEnabled("age_assurance")) notFound();
  await requireViewer();
  const check = (await searchParams).check ?? "";
  if (!uuid.safeParse(check).success) notFound();
  return (
    <AuthShell eyebrow="Test provider" title={<>Simulated <em className="text-metal">check</em></>}>
      <p className="mb-6 text-[14px] text-stone">Local testing only. A real vendor replaces this page.</p>
      <MockAgeForm check={check} />
    </AuthShell>
  );
}
