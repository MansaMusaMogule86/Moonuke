/**
 * Validate the environment as the server would at startup.
 *   NODE_ENV=production pnpm env:check
 * Exits non-zero with every problem listed. Prints no secret values.
 */
import { env } from "@/server/env";

try {
  const e = env();
  console.log(`Environment OK (${e.NODE_ENV}).`);
  console.log(`  APP_URL         ${e.APP_URL}`);
  console.log(`  TRUSTED_PROXY   ${e.TRUSTED_PROXY}`);
  console.log(`  EMAIL_TRANSPORT ${e.EMAIL_TRANSPORT}`);
  console.log(`  APP_SECRET      ${e.APP_SECRET.length} chars`);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
