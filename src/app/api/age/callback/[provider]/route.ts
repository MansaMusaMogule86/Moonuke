import { ageProvider } from "@/server/compliance/ageProvider";
import { isAppError } from "@/server/errors";
import { featureEnabled } from "@/server/flags";
import { completeAgeCheck } from "@/server/services/access";

export const dynamic = "force-dynamic";
const deny = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

/** Signed results from the age-assurance provider. A bare 404 while the feature is off. */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  if (!featureEnabled("age_assurance")) return deny();
  const p = ageProvider();
  if (!p || p.id !== (await params).provider) return deny();
  try {
    const result = await completeAgeCheck(p, await req.text(), req.headers.get("x-signature"));
    return Response.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (isAppError(e)) return new Response("Bad request", { status: 400 });
    throw e;
  }
}
