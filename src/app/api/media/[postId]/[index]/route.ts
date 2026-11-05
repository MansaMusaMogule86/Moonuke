import { getViewer } from "@/server/auth/request";
import { studySvg } from "@/server/media/placeholder";
import { verifyMediaSignature } from "@/server/media/sign";
import { getEntitledMedia } from "@/server/services/club";
import { uuid } from "@/server/validation";

export const dynamic = "force-dynamic";

const deny = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * Private media delivery. Requires ALL of:
 *  1. a valid, unexpired HMAC signature bound to this viewer and asset,
 *  2. a live session for that same viewer,
 *  3. a fresh entitlement check under RLS.
 * Phase 5 swaps the placeholder renderer for object-storage streaming.
 */
export async function GET(req: Request, { params }: { params: Promise<{ postId: string; index: string }> }) {
  const { postId, index } = await params;
  const i = Number(index);
  if (!uuid.safeParse(postId).success || !Number.isInteger(i) || i < 0 || i > 99) return deny();

  const url = new URL(req.url);
  const exp = Number(url.searchParams.get("exp"));
  const sig = url.searchParams.get("sig") ?? "";

  const viewer = await getViewer();
  if (!viewer || viewer.status !== "active") return deny();
  if (!verifyMediaSignature(postId, i, viewer.id, exp, sig)) return deny();

  const study = await getEntitledMedia(viewer, postId, i);
  if (!study) return deny();

  const svg = studySvg(study);
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
