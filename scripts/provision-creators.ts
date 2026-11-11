/**
 * One-time, owner-run provisioning of the allowlisted creators.
 * See docs/CREATOR_ONBOARDING.md. Never commit the values below.
 *
 *   PROVISION_CREATOR_1_EMAIL / PROVISION_CREATOR_1_PASSWORD
 *   PROVISION_CREATOR_2_EMAIL / PROVISION_CREATOR_2_PASSWORD
 *
 * Flags:
 *   --send          queue the branded activation email (delivered by `pnpm email:drain`)
 *   --print-links   print each activation link once, for manual delivery (treat as a secret)
 *   --allow-remote  required to run against any database that isn't on localhost
 *
 * Idempotent: re-running reissues a fresh link (revoking the old one) for an
 * account that hasn't activated yet, and leaves activated accounts alone.
 * Temporary passwords are hashed with the app's password hashing and are
 * never printed, logged, stored in plaintext or emailed.
 */
import { closePool } from "@/server/db";
import { provisionCreator } from "@/server/services/creatorProvisioning";

const args = new Set(process.argv.slice(2));
const mask = (email: string) => email.replace(/^(.).*?(.)?@/, (_m, a: string, b?: string) => `${a}***${b ?? ""}@`);

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "postgres://localhost");
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  if (!local && !args.has("--allow-remote")) {
    throw new Error(`Refusing to provision against ${url.hostname} without --allow-remote (production provisioning needs explicit approval).`);
  }
  const entries: { email: string; temporaryPassword: string }[] = [];
  for (const n of [1, 2]) {
    const email = process.env[`PROVISION_CREATOR_${n}_EMAIL`];
    const temporaryPassword = process.env[`PROVISION_CREATOR_${n}_PASSWORD`];
    delete process.env[`PROVISION_CREATOR_${n}_PASSWORD`];
    if (!email && !temporaryPassword) continue;
    if (!email || !temporaryPassword) throw new Error(`Set both PROVISION_CREATOR_${n}_EMAIL and PROVISION_CREATOR_${n}_PASSWORD.`);
    entries.push({ email, temporaryPassword });
  }
  if (!entries.length) throw new Error("Nothing to provision: set PROVISION_CREATOR_1_EMAIL and PROVISION_CREATOR_1_PASSWORD (and _2_).");

  for (const e of entries) {
    const r = await provisionCreator(e, { send: args.has("--send") });
    const note = r.outcome === "created" || r.outcome === "reissued"
      ? args.has("--send") ? "activation email queued" : "activation link issued (not sent)"
      : r.outcome === "already_active" ? "already active: unchanged" : "existing account with another role: unchanged";
    console.log(`${mask(e.email)}  ${r.outcome}  ${note}`);
    if (args.has("--print-links") && r.activationUrl) console.log(`  link (single use, expires ${r.expiresAt?.toISOString()}): ${r.activationUrl}`);
  }
}

main()
  .catch((e) => {
    console.error(`provisioning failed: ${(e as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => closePool());
