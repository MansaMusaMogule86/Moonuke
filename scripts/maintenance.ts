/**
 * Delete dead operational rows (see src/server/ops/maintenance.ts).
 * Run daily in production:  pnpm maintenance
 */
import { closePool } from "@/server/db";
import { log } from "@/server/log";
import { runMaintenance } from "@/server/ops/maintenance";

runMaintenance()
  .then((r) => log("info", "maintenance.done", r))
  .catch((e) => {
    log("error", "maintenance.failed", { message: (e as Error).message });
    process.exitCode = 1;
  })
  .finally(() => closePool());
