import { getViewer } from "@/server/auth/request";
import { gateRequest } from "@/server/compliance/access";
import { isAppError } from "@/server/errors";
import { conversationMessages } from "@/server/services/messaging";
import { uuid } from "@/server/validation";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" } });

/**
 * New messages since `after`, for the open thread (polled while the tab is
 * visible). Participants only, enforced under RLS. 404 for everything else.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer || viewer.status !== "active" || viewer.mfa === "pending" || !uuid.safeParse(id).success) return json({ error: "not_found" }, 404);
  if (!(await gateRequest(viewer)).allowed) return json({ error: "not_found" }, 404);
  const after = new URL(req.url).searchParams.get("after") ?? undefined;
  try {
    return json({ messages: await conversationMessages(viewer, id, { after }) });
  } catch (e) {
    if (isAppError(e)) return json({ error: "not_found" }, 404);
    throw e;
  }
}
