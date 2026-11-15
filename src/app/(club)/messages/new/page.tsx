import { notFound, redirect } from "next/navigation";
import { requireViewer } from "@/server/auth/request";

export default async function NewConversationRedirectPage() {
  const viewer = await requireViewer("club.discover");
  if (viewer.role !== "creator") notFound();
  redirect("/studio/messaging/new");
}
