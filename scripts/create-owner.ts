/**
 * Bootstrap the single platform owner on a fresh database.
 *   OWNER_EMAIL=… OWNER_ALIAS=… OWNER_PASSWORD=… pnpm owner:create
 * The database's unique index guarantees there can only ever be one owner;
 * a second run fails safely.
 */
import { createOwner } from "@/server/services/accounts";
import { closePool } from "@/server/db";
import { alias, email, password } from "@/server/validation";

async function main() {
  const input = {
    email: email.parse(process.env.OWNER_EMAIL),
    alias: alias.parse(process.env.OWNER_ALIAS ?? "The House"),
    password: password.parse(process.env.OWNER_PASSWORD),
  };
  try {
    const id = await createOwner(input);
    console.log(`Owner created: ${input.email} (${id})`);
  } catch (e) {
    if ((e as { code?: string }).code === "23505") {
      console.error("An owner (or this email/alias) already exists. Nothing was changed.");
      process.exitCode = 1;
    } else throw e;
  } finally {
    await closePool();
  }
}

main();
