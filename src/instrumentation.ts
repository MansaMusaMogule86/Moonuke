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
