/**
 * Grant an existing account creator access (operator tool).
 *   ACCOUNT_EMAIL=… [ACCOUNT_ENROL_MFA=true] pnpm creator:make
 *
 * Sets role=creator and confirms the email. With ACCOUNT_ENROL_MFA=true it also
 * enrols a two-step sign-in factor with a NEW random secret, printed once. The
 * encrypted secret is only readable by an app using the SAME APP_SECRET, so only
 * enable it for a database your current APP_SECRET belongs to. Creators must
 * have MFA and a verified email before any Studio page opens.
 * Refuses in production unless ACCOUNT_CREATE_ALLOW_PRODUCTION=true.
 */
import { system, closePool } from "@/server/db";
import { encryptSecret, newSecret } from "@/server/auth/totp";
import { email as emailSchema } from "@/server/validation";

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ACCOUNT_CREATE_ALLOW_PRODUCTION !== "true") {
    throw new Error("Refusing to change roles in production. Set ACCOUNT_CREATE_ALLOW_PRODUCTION=true to override.");
  }
  const email = emailSchema.parse(process.env.ACCOUNT_EMAIL);
  const enrol = process.env.ACCOUNT_ENROL_MFA === "true";

  const out = await system(async (q) => {
    const u = await q.one<{ id: string }>(`select id from app.users where email = $1`, [email]);
    if (!u) throw new Error(`no account with that email: ${email}`);
    await q.query(
      `update app.users set role = 'creator', status = 'active', email_verified_at = coalesce(email_verified_at, now()), updated_at = now() where id = $1`,
      [u.id],
    );
    let secret: string | null = null;
    if (enrol) {
      const existing = await q.one<{ confirmed_at: Date | null }>(`select confirmed_at from app.mfa_factors where user_id = $1`, [u.id]);
      if (!existing?.confirmed_at) {
        secret = newSecret();
        await q.query(
          `insert into app.mfa_factors (user_id, secret_enc, confirmed_at) values ($1, $2, now())
           on conflict (user_id) do update set secret_enc = excluded.secret_enc, confirmed_at = now(), last_used_step = null`,
          [u.id, encryptSecret(secret)],
        );
      }
    }
    return { secret };
  });

  console.log(`creator: ${email}`);
  if (enrol && out.secret) console.log(`two-step secret (shown once): ${out.secret}`);
  else if (enrol) console.log("two-step sign-in already enrolled; the existing secret still works");
  else console.log("two-step sign-in NOT enrolled - the creator must set it up at /account/security");
  await closePool();
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
