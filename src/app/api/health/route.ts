import { system } from "@/server/db";

export const dynamic = "force-dynamic";

const reply = (ok: boolean) =>
  new Response(JSON.stringify({ status: ok ? "ok" : "unavailable" }), {
    status: ok ? 200 : 503,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/**
 * Liveness + database readiness for a load balancer or uptime check.
 * Reveals nothing else: no version, no counts, no error text.
 */
export async function GET() {
  try {
    const ok = await Promise.race([
      system((q) => q.one<{ ok: number }>(`select 1 as ok`)).then((r) => r?.ok === 1),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2000)),
    ]);
    return reply(ok);
  } catch {
    return reply(false);
  }
}
