import fs from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { can } from "@/server/auth/permissions";
import { creatorEmailAllowed, normalizeEmail, PRODUCTION_CREATOR_ALLOWLIST } from "@/server/auth/creatorAllowlist";
import { codeAt, currentStep } from "@/server/auth/totp";
import { activateProvisionedAccount, inspectInvitation, redeemInvitation, signIn } from "@/server/services/accounts";
import { createInvitation } from "@/server/services/admin";
import { provisionCreator } from "@/server/services/creatorProvisioning";
import { confirmEnrollment, startEnrollment, verifyChallenge } from "@/server/services/mfa";
import { resolveSession } from "@/server/services/sessions";
import { DEV_PASSWORD, type SeedResult } from "@/server/seed";
import { allowCreatorFixture, closePool, meta, resetDb, system, viewer } from "./helpers";

/** Test-only addresses and passwords (never the real ones). */
const ALLOWED = "Creator.One@Example.test";
const TEMP = "temporary-Pass-0001!";
const NEW = "my-own-new-password-42";
let s: SeedResult;
beforeEach(async () => {
  s = await resetDb();
  await allowCreatorFixture(normalizeEmail(ALLOWED));
});
afterEach(() => vi.unstubAllEnvs());
afterAll(closePool);

const tokenOf = (url?: string) => url!.split("/invite/")[1];
const user = (email: string) => system((q) => q.one<{ id: string; role: string; status: string; must_change_password: boolean; password_hash: string; email_verified_at: Date | null }>(
  `select id, role, status, must_change_password, password_hash, email_verified_at from app.users where email = $1`, [normalizeEmail(email)]));
const activate = (token: string) => activateProvisionedAccount(token, { temporaryPassword: TEMP, password: NEW }, meta);

describe("the allowlist", () => {
  it("production holds exactly the two approved addresses, matching the code list", async () => {
    const sql = fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations/20261119000001_creator_allowlist.sql"), "utf8");
    const inserted = [...sql.matchAll(/insert into app\.creator_allowlist \(email\) values (.+);/g)].flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
    expect(inserted.sort()).toEqual([...PRODUCTION_CREATOR_ALLOWLIST].sort());
    expect(PRODUCTION_CREATOR_ALLOWLIST).toEqual(["hjaouhari0@gmail.com", "mehdi.alaouiismaili9@gmail.com"]);
    const rows = await system((q) => q.query<{ email: string }>(`select email::text from app.creator_allowlist where source = 'production' order by 1`));
    expect(rows.map((r) => r.email)).toEqual(["hjaouhari0@gmail.com", "mehdi.alaouiismaili9@gmail.com"]);
  });

  it("matches exactly after trimming and lower-casing; no dot or plus folding", async () => {
    await system(async (q) => {
      expect(await creatorEmailAllowed(q, "  Mehdi.AlaouiIsmaili9@Gmail.com ")).toBe(true);
      expect(await creatorEmailAllowed(q, "mehdialaouiismaili9@gmail.com")).toBe(false);
      expect(await creatorEmailAllowed(q, "mehdi.alaouiismaili9+creator@gmail.com")).toBe(false);
      expect(await creatorEmailAllowed(q, "hjaouhari0@gmail.co")).toBe(false);
    });
  });

  it("in live production, test-fixture rows never count", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_LOCAL_PRODUCTION", "");
    await system(async (q) => {
      expect(await creatorEmailAllowed(q, ALLOWED)).toBe(false);
      expect(await creatorEmailAllowed(q, "hjaouhari0@gmail.com")).toBe(true);
    });
  });
});

describe("no other address can become a creator", () => {
  it("the owner can't invite a non-allowlisted address, a multi-use or an unbound creator invitation", async () => {
    const owner = await viewer(s.ownerId);
    await expect(createInvitation(owner, { role: "creator", email: "someone@example.com", maxUses: 1, expiresInDays: 3 })).rejects.toMatchObject({ field: "email" });
    await expect(createInvitation(owner, { role: "creator", maxUses: 1, expiresInDays: 3 })).rejects.toMatchObject({ field: "email" });
    await expect(createInvitation(owner, { role: "creator", email: ALLOWED, maxUses: 2, expiresInDays: 3 })).rejects.toMatchObject({ field: "maxUses" });
    const ok = await createInvitation(owner, { role: "creator", email: ALLOWED, maxUses: 1, expiresInDays: 3 });
    expect(ok.token).toBeTruthy();
  });

  it("the database refuses it for every role, including privileged server code", async () => {
    const code = (sql: string, params: unknown[] = []) => system((q) => q.query(sql, params)).then(() => null, (e) => e.code);
    // Direct creator invitation for another address.
    expect(await code(`insert into app.invitations (token_hash, intended_role, email, max_uses, expires_at, created_by) values (decode(repeat('ab',32),'hex'), 'creator', 'x@example.com', 1, now() + interval '1 day', $1)`, [s.ownerId])).toBe("42501");
    // Role escalation of an existing member.
    expect(await code(`update app.users set role = 'creator' where id = $1`, [s.member2Id])).toBe("42501");
    // A creator changing their email to a non-allowlisted one.
    expect(await code(`update app.users set email = 'elsewhere@example.com' where id = $1`, [s.creatorIds.isadora])).toBe("42501");
    // Inserting a creator account directly.
    expect(await code(`insert into app.users (email, password_hash, role, status, alias, adult_attested_at) values ('rogue@example.com', 'x', 'creator', 'active', 'Rogue One', now())`)).toBe("42501");
    // Unrelated roles are untouched.
    expect(await code(`update app.users set alias = 'Velvet Two' where id = $1`, [s.member2Id])).toBeNull();
  });

  it("the app role can't change roles at all", async () => {
    const { asViewer } = await import("./helpers");
    const err = await asViewer({ id: s.ownerId, aal: 2 }, (q) => q.query(`update app.users set role = 'creator' where id = $1`, [s.member2Id])).then(() => null, (e) => e.code);
    expect(err).toBe("42501");
  });
});

describe("provisioning", () => {
  it("creates a pending creator with only a password hash, an approved application and a single-use bound link; nothing is emailed without --send", async () => {
    const r = await provisionCreator({ email: ALLOWED, temporaryPassword: TEMP });
    expect(r.outcome).toBe("created");
    const u = (await user(ALLOWED))!;
    expect(u).toMatchObject({ role: "creator", status: "pending", must_change_password: true, email_verified_at: null });
    expect(u.password_hash).toMatch(/^scrypt\$/);
    expect(JSON.stringify(await system((q) => q.query(`select * from app.users where id = $1`, [u.id])))).not.toContain(TEMP);
    expect(await inspectInvitation(tokenOf(r.activationUrl))).toMatchObject({ role: "creator", emailLocked: true, activation: true });
    const app = await system((q) => q.one<{ status: string; decided_by: string }>(`select status, decided_by from app.applications where user_id = $1`, [u.id]));
    expect(app).toMatchObject({ status: "approved", decided_by: s.ownerId });
    expect(await system((q) => q.query(`select 1 from app.email_outbox where template = 'creator_activation'`))).toHaveLength(0);
  });

  it("is idempotent: re-running reissues a link (revoking the old one) and never duplicates the account", async () => {
    const a = await provisionCreator({ email: ALLOWED, temporaryPassword: TEMP });
    const b = await provisionCreator({ email: ALLOWED, temporaryPassword: TEMP }, { send: true });
    expect(b.outcome).toBe("reissued");
    expect(await system((q) => q.query(`select 1 from app.users where email = $1`, [normalizeEmail(ALLOWED)]))).toHaveLength(1);
    expect(await inspectInvitation(tokenOf(a.activationUrl))).toBeNull();
    const mail = await system((q) => q.one<{ body_text: string }>(`select body_text from app.email_outbox where template = 'creator_activation'`));
    expect(mail!.body_text).toContain("/invite/");
    expect(mail!.body_text).not.toContain(TEMP); // never a password by email
  });

  it("refuses non-allowlisted addresses and leaves other accounts alone", async () => {
    await expect(provisionCreator({ email: "someone@example.com", temporaryPassword: TEMP })).rejects.toMatchObject({ code: "forbidden" });
    await allowCreatorFixture("velvet@divafans.test");
    expect((await provisionCreator({ email: "velvet@divafans.test", temporaryPassword: TEMP })).outcome).toBe("skipped_other_role");
    expect((await user("velvet@divafans.test"))!.role).toBe("member");
    expect((await provisionCreator({ email: "isadora@divafans.test", temporaryPassword: TEMP })).outcome).toBe("already_active");
  });
});

describe("activation, password rotation and MFA", () => {
  it("the temporary password can't sign in: activation comes first", async () => {
    await provisionCreator({ email: ALLOWED, temporaryPassword: TEMP });
    await expect(signIn(normalizeEmail(ALLOWED), TEMP, meta)).rejects.toMatchObject({ code: "forbidden" });
    expect(await system((q) => q.query(`select 1 from app.sessions s join app.users u on u.id = s.user_id where u.email = $1`, [normalizeEmail(ALLOWED)]))).toHaveLength(0);
  });

  it("a wrong temporary password doesn't consume the link; success rotates the password, confirms the email and opens the account once", async () => {
    const r = await provisionCreator({ email: ALLOWED, temporaryPassword: TEMP });
    const token = tokenOf(r.activationUrl);
    await expect(activateProvisionedAccount(token, { temporaryPassword: "wrong-temporary-pass", password: NEW }, meta)).rejects.toMatchObject({ code: "invalid_invitation" });
    await expect(activateProvisionedAccount(token, { temporaryPassword: TEMP, password: TEMP }, meta)).rejects.toMatchObject({ field: "password" });
    await activate(token);
    const u = (await user(ALLOWED))!;
    expect(u).toMatchObject({ status: "active", must_change_password: false });
    expect(u.email_verified_at).not.toBeNull();
    await expect(activate(token)).rejects.toMatchObject({ code: "invalid_invitation" }); // single use
    await expect(signIn(normalizeEmail(ALLOWED), TEMP, meta)).rejects.toMatchObject({ code: "invalid_credentials" });
  });

  it("expired links and application-style redemption of an activation link are refused", async () => {
    const r = await provisionCreator({ email: ALLOWED, temporaryPassword: TEMP });
    const token = tokenOf(r.activationUrl);
    await expect(redeemInvitation(token, { alias: "Someone Else", email: normalizeEmail(ALLOWED), password: NEW }, meta)).rejects.toMatchObject({ code: "invalid_invitation" });
    await system((q) => q.query(`update app.invitations set expires_at = now() - interval '1 minute' where activates_user_id is not null`));
    await expect(activate(token)).rejects.toMatchObject({ code: "invalid_invitation" });
  });

  it("an activation link only works for its own address", async () => {
    const r = await provisionCreator({ email: ALLOWED, temporaryPassword: TEMP });
    // Tamper: the account's email no longer matches the link's bound address.
    await allowCreatorFixture("creator.two@example.test");
    const u = (await user(ALLOWED))!;
    await system((q) => q.query(`update app.users set email = 'creator.two@example.test' where id = $1`, [u.id]));
    await expect(activate(tokenOf(r.activationUrl))).rejects.toMatchObject({ code: "invalid_invitation" });
  });

  it("after activation, creator permissions stay closed until two-step sign-in is set up and verified", async () => {
    const r = await provisionCreator({ email: ALLOWED, temporaryPassword: TEMP });
    await activate(tokenOf(r.activationUrl));
    const { sessionToken } = await signIn(normalizeEmail(ALLOWED), NEW, meta);
    let v = (await resolveSession(sessionToken))!;
    expect(v).toMatchObject({ role: "creator", mfa: "none", aal: 1, emailVerified: true });
    expect(can(v, "club.discover")).toBe(false);
    const { secret } = await startEnrollment(v);
    await confirmEnrollment(v, codeAt(secret, currentStep()));
    v = (await resolveSession(sessionToken))!;
    expect(v.aal).toBe(2);
    expect(can(v, "club.discover")).toBe(true);
    // A fresh sign-in needs the second factor again before anything opens.
    const again = await signIn(normalizeEmail(ALLOWED), NEW, meta);
    const v2 = (await resolveSession(again.sessionToken))!;
    expect(v2.mfa).toBe("pending");
    expect(can(v2, "club.discover")).toBe(false);
    await verifyChallenge(v2, codeAt(secret, currentStep() + 1), meta);
    expect(can((await resolveSession(again.sessionToken))!, "club.discover")).toBe(true);
  });

  it("a creator without a confirmed email has no creator permissions, even at AAL2", async () => {
    const v = await viewer(s.creatorIds.isadora);
    expect(can(v, "club.discover")).toBe(true);
    expect(can({ ...v, emailVerified: false }, "club.discover")).toBe(false);
    expect(can({ ...v, aal: 1 }, "club.discover")).toBe(false);
    // Members are unaffected.
    expect(can(await viewer(s.member2Id), "club.discover")).toBe(true);
    // The seeded creator still signs in normally with the dev password.
    await expect(signIn("isadora@divafans.test", DEV_PASSWORD, meta)).resolves.toBeTruthy();
  });
});
