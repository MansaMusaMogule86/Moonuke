import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { uuid } from "@/server/validation";
import { CaseView } from "../../CaseView";

export const metadata: Metadata = { title: "Onboarding case" };

export default async function CasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  if (!uuid.safeParse(caseId).success) notFound();
  return <CaseView caseId={caseId} />;
}
