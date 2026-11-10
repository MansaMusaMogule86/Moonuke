/**
 * Security monitoring jobs (see docs/SECURITY_MONITORING_OPERATIONS.md).
 * Run every 15 minutes in production:  pnpm security:run
 * - sends the daily digest once, at the configured local time (Asia/Dubai by default);
 * - applies retention only when it has been approved and switched on;
 * - flushes queued email (alerts are queued at the moment they are raised).
 */
import { closePool } from "@/server/db";
import { deliverPending } from "@/server/email/outbox";
import { log } from "@/server/log";
import { runSecurityDigest, runSecurityRetention } from "@/server/security/jobs";

async function main() {
  const digest = await runSecurityDigest();
  const retention = await runSecurityRetention();
  const sent = await deliverPending(50);
  log("info", "security.jobs_done", { digest, retention, emailsSent: sent });
}

main()
  .catch((e) => {
    log("error", "security.jobs_failed", { message: (e as Error).message });
    process.exitCode = 1;
  })
  .finally(() => closePool());
