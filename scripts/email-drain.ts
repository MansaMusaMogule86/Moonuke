/**
 * Deliver queued transactional email. Run on a schedule (e.g. every minute)
 * in production as a safety net for in-request delivery:
 *   pnpm email:drain
 */
import { deliverPending } from "@/server/email/outbox";
import { closePool } from "@/server/db";

async function main() {
  let total = 0;
  for (;;) {
    const n = await deliverPending(50);
    total += n;
    if (n < 50) break;
  }
  console.log(`Delivered ${total} message(s).`);
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
