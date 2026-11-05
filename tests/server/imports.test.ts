import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getOnboarding } from "@/server/services/creatorOnboarding";
import { decideProposal, importProfile, myProposals, mySocials, proposeProfile } from "@/server/services/onboarding";
import { importHash, parseImport } from "@/server/imports/parse";
import { linkFromUrl } from "@/server/imports/social";
import type { SeedResult } from "@/server/seed";
import { asViewer, closePool, resetDb, rlsError, system, viewer } from "./helpers";

describe("import parser (local, no network)", () => {
  it("reads labelled pasted text: name, tagline, multi-line bio and links", () => {
    const r = parseImport(
      "Name: Rhea Kiln\nTagline: Wood-fired, slow.\nBio: Stoneware from an anagama kiln.\nGlaze tests weekly.\nWebsite: https://rhea-ceramics.example/\nhttps://www.instagram.com/rhea.kiln?igsh=abc",
    );
    expect(r.fields).toEqual({ displayName: "Rhea Kiln", tagline: "Wood-fired, slow.", bio: "Stoneware from an anagama kiln.\nGlaze tests weekly." });
    expect(r.links).toEqual([
      { platform: "website", handle: "rhea-ceramics.example", url: "https://rhea-ceramics.example/" },
      { platform: "instagram", handle: "rhea.kiln", url: "https://www.instagram.com/rhea.kiln" },
    ]);
  });

  it("unlabelled text: first short line is the name, the rest is the bio", () => {
    const r = parseImport("Rhea Kiln\nPotter in Lyon.\nSlow work.");
    expect(r.fields).toEqual({ displayName: "Rhea Kiln", bio: "Potter in Lyon.\nSlow work." });
  });

  it("reads generic JSON exports, including { key: { value } } shapes", () => {
    const r = parseImport(JSON.stringify({ profile_user: [{ string_map_data: { Name: { value: "Rhea" }, Bio: { value: "Kiln notes." }, Website: { value: "https://x.com/rhea_k" } } }] }));
    expect(r.fields).toEqual({ displayName: "Rhea", bio: "Kiln notes." });
    expect(r.links).toEqual([{ platform: "x", handle: "rhea_k", url: "https://x.com/rhea_k" }]);
  });

  it("strips contact details from copy and refuses unsafe copy", () => {
    const r = parseImport("Name: Rhea\nBio: Write to me at rhea@example.com or +33 6 12 34 56 78 for bookings.");
    expect(r.fields.bio).not.toMatch(/@|\d{3}/);
    expect(() => parseImport("Name: Rhea\nBio: barely legal looks")).toThrow(/can't be used/);
  });

  it("skips insecure, credentialed and off-platform links; caps the count; dedupes", () => {
    const r = parseImport(
      [
        "Name: Rhea",
        "http://insecure.example/",
        "https://user:pw@evil.example/",
        "https://www.instagram.com/",
        "https://twitter.com/rhea_k",
        "https://x.com/RHEA_K",
        ...Array.from({ length: 12 }, (_, i) => `https://site${i}.example/`),
      ].join("\n"),
    );
    expect(r.links.length).toBe(8);
    expect(r.links.filter((l) => l.platform === "x")).toHaveLength(1);
    expect(r.links.some((l) => l.url.startsWith("http:"))).toBe(false);
    expect(r.warnings.join(" ")).toMatch(/https/);
    expect(linkFromUrl("javascript:alert(1)")).toBeNull();
    expect(linkFromUrl("https://instagram.com.evil.example/x")?.platform).toBe("website");
  });

  it("rejects empty, oversized and content-free input; strips control characters", () => {
    expect(() => parseImport("   ")).toThrow();
    expect(() => parseImport("a".repeat(20_001))).toThrow(/too long/);
    expect(() => parseImport("{}")).toThrow(/couldn't find/);
    expect(parseImport("Name: Rh‮ea\u0000").fields.displayName).toBe("Rhea");
  });

  it("hashes the parsed result, not formatting", () => {
    expect(importHash(parseImport("Name: Rhea\nBio: Kiln."))).toBe(importHash(parseImport("name :  Rhea\n\nbio: Kiln.")));
    expect(importHash(parseImport("Name: Rhea"))).not.toBe(importHash(parseImport("Name: Rhéa")));
  });
});

describe("profile imports (PostgreSQL)", () => {
  let s: SeedResult;
  beforeEach(async () => {
    s = await resetDb();
  });
  afterAll(closePool);

  it("a creator's import becomes a proposal; the profile is unchanged until they accept", async () => {
    const rhea = await viewer(s.creatorIds.rhea);
    const r = await importProfile(rhea, rhea.id, "Tagline: Wood-fired, slow.\nhttps://www.tiktok.com/@rhea.kiln");
    expect(r).toMatchObject({ fields: ["tagline"], links: 1 });
    expect((await getOnboarding(rhea)).profile!.tagline).toBe("Kiln notes and glaze tests.");
    const [p] = await myProposals(rhea);
    expect(p).toMatchObject({ source: "import", status: "proposed" });
    await decideProposal(rhea, p.id, true);
    expect((await getOnboarding(rhea)).profile!.tagline).toBe("Wood-fired, slow.");
    const tiktok = (await mySocials(rhea)).find((x) => x.platform === "tiktok")!;
    // Imported links are claims only: unverified, hidden, with a fresh proof code.
    expect(tiktok).toMatchObject({ handle: "rhea.kiln", status: "unverified", show_on_profile: false });
    expect(tiktok.proof_code).toMatch(/^mnk-[0-9a-f]{8}$/);
  });

  it("declining an import changes nothing and adds no socials", async () => {
    const rhea = await viewer(s.creatorIds.rhea);
    const before = (await mySocials(rhea)).length;
    const r = await importProfile(rhea, rhea.id, "Name: Someone Else\nhttps://www.youtube.com/@other");
    await decideProposal(rhea, r.proposalId, false);
    expect((await getOnboarding(rhea)).profile!.displayName).not.toBe("Someone Else");
    expect((await mySocials(rhea)).length).toBe(before);
  });

  it("prevents duplicates: same import twice is refused; an existing social isn't added twice", async () => {
    const rhea = await viewer(s.creatorIds.rhea);
    const text = "Bio: Kiln notes.\nhttps://www.instagram.com/rhea.kiln";
    const r = await importProfile(rhea, rhea.id, text);
    await expect(importProfile(rhea, rhea.id, text)).rejects.toMatchObject({ code: "conflict" });
    await decideProposal(rhea, r.proposalId, true);
    await expect(importProfile(rhea, rhea.id, `${text}\n`)).rejects.toMatchObject({ code: "conflict" });
    // The seeded instagram claim already exists: no duplicate row.
    expect((await mySocials(rhea)).filter((x) => x.platform === "instagram" && x.handle === "rhea.kiln")).toHaveLength(1);
  });

  it("a creator can't import over an open house proposal; the owner's import supersedes it", async () => {
    const owner = await viewer(s.ownerId);
    const rhea = await viewer(s.creatorIds.rhea);
    await proposeProfile(owner, rhea.id, { tagline: "House draft." });
    await expect(importProfile(rhea, rhea.id, "Tagline: Mine.")).rejects.toMatchObject({ code: "conflict" });
    await importProfile(owner, rhea.id, "Tagline: Imported by the house.");
    expect((await myProposals(rhea)).map((p) => [p.source, p.status])).toEqual([
      ["import", "proposed"],
      ["house", "superseded"],
    ]);
  });

  it("app layer: members, other creators and a non-MFA owner can't import for a creator", async () => {
    const member = await viewer(s.memberId);
    const isadora = await viewer(s.creatorIds.isadora);
    const owner = await viewer(s.ownerId);
    await expect(importProfile(member, s.creatorIds.rhea, "Name: X")).rejects.toMatchObject({ code: "forbidden" });
    await expect(importProfile(member, member.id, "Name: X")).rejects.toMatchObject({ code: "forbidden" });
    await expect(importProfile(isadora, s.creatorIds.rhea, "Name: X")).rejects.toMatchObject({ code: "forbidden" });
    await expect(importProfile({ ...owner, aal: 1 }, s.creatorIds.rhea, "Name: X")).rejects.toMatchObject({ code: "forbidden" });
    await expect(importProfile(owner, s.memberId, "Name: X")).rejects.toMatchObject({ code: "not_found" });
  });

  it("RLS: nobody can file an import for another creator, and imports must carry a hash", async () => {
    const h = "a".repeat(64);
    const ins = `insert into app.profile_proposals (user_id, author_id, source, fields, import_hash) values ($1, $2, 'import', '{}', $3)`;
    expect(await rlsError(s.creatorIds.isadora, ins, [s.creatorIds.rhea, s.creatorIds.isadora, h], 1)).toBe("42501");
    expect(await rlsError(s.memberId, ins, [s.memberId, s.memberId, h], 1)).toBe("42501");
    // Owner without MFA (aal 1) is not the owner to the database.
    expect(await rlsError(s.ownerId, ins, [s.creatorIds.rhea, s.ownerId, h], 1)).toBe("42501");
    // Check constraint: import rows need a hash; hashes only on import rows.
    expect(await rlsError(s.creatorIds.rhea, `insert into app.profile_proposals (user_id, author_id, source, fields) values ($1, $1, 'import', '{}')`, [s.creatorIds.rhea], 1)).toBe("23514");
    expect(await rlsError(s.creatorIds.rhea, `insert into app.profile_proposals (user_id, author_id, source, fields, import_hash) values ($1, $1, 'creator', '{}', $2)`, [s.creatorIds.rhea, h], 1)).toBe("23514");
    // The unique index backs the app-level duplicate check.
    expect(await rlsError(s.creatorIds.rhea, ins, [s.creatorIds.rhea, s.creatorIds.rhea, h], 1)).toBeNull();
    await asViewer({ id: s.creatorIds.rhea, aal: 1 }, (q) => q.query(`update app.profile_proposals set status = 'declined' where user_id = $1`, [s.creatorIds.rhea]));
    expect(await rlsError(s.creatorIds.rhea, ins, [s.creatorIds.rhea, s.creatorIds.rhea, h], 1)).toBe("23505");
  });

  it("audits the import without storing the raw text", async () => {
    const rhea = await viewer(s.creatorIds.rhea);
    const secretish = "Bio: Kiln notes. UNIQUE-MARKER-7731 rhea@example.com";
    await importProfile(rhea, rhea.id, secretish);
    const a = await system((q) => q.one<{ metadata: Record<string, unknown> }>(`select metadata from app.audit_log where action = 'proposal.import' order by id desc limit 1`));
    expect(a!.metadata).toEqual({ fields: ["bio"], links: 0, by: "creator" });
    const leaked = await system((q) =>
      q.one<{ n: number }>(
        `select (select count(*) from app.profile_proposals where fields::text like '%rhea@example.com%')
              + (select count(*) from app.audit_log where metadata::text like '%UNIQUE-MARKER%') as n`,
      ),
    );
    expect(Number(leaked!.n)).toBe(0);
  });
});
