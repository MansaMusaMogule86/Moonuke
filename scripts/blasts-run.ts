/**
 * Deliver due Blasts. Run every minute in production:  pnpm blasts:run
 * Idempotent and safe to run concurrently (SKIP LOCKED claims).
 */
import { closePool } from "@/server/db";
import { log } from "@/server/log";
import { runBlasts } from "@/server/messaging/blasts";

runBlasts()
  .then((r) => log("info", "blasts.done", r))
  .catch((e) => {
    log("error", "blasts.failed", { message: (e as Error).message });
    process.exitCode = 1;
  })
  .finally(() => closePool());
