import { featureEnabled } from "@/server/flags";

export const dynamic = "force-dynamic";

/**
 * Payment webhook endpoint. Inert: payments are disabled and no provider is
 * registered, so every request gets the same bare 404 (no hint that the
 * route exists). When a provider is approved its adapter verifies the raw
 * body signature here, then calls applyEvent() (src/server/payments/engine.ts).
 */
export async function POST() {
  if (!featureEnabled("payments")) return new Response("Not found", { status: 404 });
  return new Response("Not found", { status: 404 });
}
