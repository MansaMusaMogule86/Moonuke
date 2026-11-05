/**
 * DEV ONLY: reset the database, apply migrations and load seed content.
 *   pnpm db:seed
 */
import { migrate } from "./migrate";
import { seed, DEV_PASSWORD, DEV_OWNER_TOTP_SECRET } from "@/server/seed";
import { closePool } from "@/server/db";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed in production.");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  await migrate(url, { reset: true });
  const r = await seed();
  await closePool();
  const base = process.env.APP_URL ?? "http://localhost:3000";
  console.log(`
Seeded MOONUKE (development data — fictional people).

  Password for every seeded account: ${DEV_PASSWORD}

  owner     owner@moonuke.test       (The House — two-step sign-in required)
            authenticator secret: ${DEV_OWNER_TOTP_SECRET}  (add to any TOTP app; dev only)
  member    nocturne@moonuke.test    (VIP of Isadora, member of Zara & Orsolya, bought a PPV)
  member    velvet@moonuke.test      (no memberships)
  pending   satellite@moonuke.test   (awaiting approval)
  creator   isadora@moonuke.test     (and <handle>@moonuke.test for every creator)

  Member invitation (3 uses):  ${base}/invite/${r.inviteToken}
  Creator invitation (1 use):  ${base}/invite/${r.creatorInviteToken}
`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
