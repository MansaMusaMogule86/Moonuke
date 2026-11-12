/**
 * Set (reset) the password for an existing account.
 *   ACCOUNT_EMAIL=… ACCOUNT_PASSWORD=… pnpm password:set
 *
 * Operator tool. The app keeps its OWN password hash in app.users; it does not
 * read Supabase Auth passwords, so changing a password in Supabase has no effect
 * here. Use this to align an account's password with what you expect.
 * Refuses in production unless ACCOUNT_CREATE_ALLOW_PRODUCTION=true is also set.
 */
import { system, closePool } from "@/server/db";
import { hashPassword } from "@/server/auth/crypto";
import { email as emailSchema, password as passwordSchema } from "@/server/validation";

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ACCOUNT_CREATE_ALLOW_PRODUCTION !== "true") {
    throw new Error("Refusing to change a password in production. Set ACCOUNT_CREATE_ALLOW_PRODUCTION=true to override.");
  }
  const email = emailSchema.parse(process.env.ACCOUNT_EMAIL);
  const password = passwordSchema.parse(process.env.ACCOUNT_PASSWORD);
  const passwordHash = await hashPassword(password);

  const updated = await system(async (q) =>
    q.one<{ id: string }>(
      `update app.users set password_hash = $1, must_change_password = false, updated_at = now()
        where email = $2 returning id`,
      [passwordHash, email],
    ),
  );

  console.log(updated ? `password updated: ${email}` : `no account with that email: ${email}`);
  await closePool();
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
