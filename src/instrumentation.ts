import type { Instrumentation } from "next";

/**
 * Runs once when the server starts. Fails fast on an unsafe production
 * configuration instead of serving traffic with defaults.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { env } = await import("@/server/env");
    env();
  }
}

/**
 * Server errors → one redacted JSON line. The digest matches the reference
 * shown on the error page, so a report can be traced without exposing details.
 * The query string is dropped (it can carry tokens, e.g. invitation links).
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { log } = await import("@/server/log");
  const e = err as Error & { digest?: string; code?: string };
  log("error", "request.error", {
    digest: e.digest,
    name: e.name,
    pgCode: e.code,
    message: e.message,
    method: request.method,
    path: request.path.split("?")[0].replace(/\/invite\/[^/]+/, "/invite/[token]").replace(/\/reset\/[^/]+/, "/reset/[token]"),
    routeType: context.routeType,
    route: context.routePath,
  });
};
