import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { uuid } from "@/server/validation";
import { CaseView } from "../../CaseView";

export const metadata: Metadata = { title: "Creator onboarding" };

export default async function CreatorCasePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  if (!uuid.safeParse(userId).success) notFound();
  return <CaseView userId={userId} />;
}
