/**
 * Create (or reactivate) a single ACTIVE member account from the environment.
 *   ACCOUNT_EMAIL=… ACCOUNT_PASSWORD=… [ACCOUNT_ALIAS=…] pnpm member:create
 *
 * Operator bootstrap tool, the sibling of `owner:create`. Use it to make a
 * specific address able to sign in on a fresh database — local dev or the
 * deployed/Supabase database — without waiting for the invitation flow.
 * Idempotent: an existing account is left untouched. Refuses in production
 * unless ACCOUNT_CREATE_ALLOW_PRODUCTION=true is also set.
 */
import { system, closePool } from "@/server/db";
import { hashPassword } from "@/server/auth/crypto";
import { alias as aliasSchema, email as emailSchema, password as passwordSchema } from "@/server/validation";

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ACCOUNT_CREATE_ALLOW_PRODUCTION !== "true") {
    throw new Error("Refusing to create an account in production. Set ACCOUNT_CREATE_ALLOW_PRODUCTION=true to override.");
  }
  const email = emailSchema.parse(process.env.ACCOUNT_EMAIL);
  const password = passwordSchema.parse(process.env.ACCOUNT_PASSWORD);
  const alias = aliasSchema.parse(process.env.ACCOUNT_ALIAS ?? (email.split("@")[0].replace(/[^a-z0-9]/gi, "").slice(0, 24) || "member"));
  const passwordHash = await hashPassword(password);

  const result = await system(async (q) => {
    const existing = await q.one<{ id: string }>(`select id from app.users where email = $1`, [email]);
    if (existing) return "exists";
    await q.query(
      `insert into app.users (email, password_hash, role, status, alias, adult_attested_at, approved_at, email_verified_at)
       values ($1, $2, 'member', 'active', $3, now(), now(), now())`,
      [email, passwordHash, alias],
    );
    return "created";
  });

  console.log(`${result}: ${email} (alias: ${alias})`);
  await closePool();
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
