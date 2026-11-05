import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { LIMITS, sniff, validateFile } from "@/server/media/upload/signature";
import { MemoryStorage, MockScanner, MOCK_MATCH_MARKER } from "@/server/media/upload/mock";
import { cleanupAbandoned, previewUrl, uploadMedia } from "@/server/media/upload/service";
import type { SeedResult } from "@/server/seed";
import { asViewer, closePool, resetDb, rlsError, system, viewer } from "./helpers";

let s: SeedResult;
beforeEach(async () => {
  s = await resetDb();
});
afterAll(closePool);

const png = (extra = "") => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, ...Buffer.from(`IHDRpixels${extra}`)]);
const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 1]);
const exe = () => new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0, 0xff, 0xff]);

describe("file signatures", () => {
  it("accepts matching signatures only; rejects spoofed MIME, unknown types and oversize files", () => {
    expect(sniff(png())?.mime).toBe("image/png");
    expect(sniff(jpeg())?.mime).toBe("image/jpeg");
    expect(validateFile(png(), "image/png", 100).ok).toBe(true);
    expect(validateFile(png(), "image/jpeg", 100)).toMatchObject({ ok: false });
    expect(validateFile(exe(), "image/png", 100)).toMatchObject({ ok: false });
    expect(validateFile(new Uint8Array(4), "image/png", 4)).toMatchObject({ ok: false });
    expect(validateFile(png(), "image/png", LIMITS.image + 1)).toMatchObject({ ok: false });
    expect(validateFile(jpeg(), "image/jpg", 50).ok).toBe(true);
  });
});

describe("upload pipeline (mock storage and scanner)", () => {
  const deps = () => ({ storage: new MemoryStorage(), scanner: new MockScanner(), testing: true });

  it("is OFF by default", async () => {
    await expect(uploadMedia(await viewer(s.creatorIds.isadora), "post", "image/png", png(), { storage: new MemoryStorage(), scanner: new MockScanner() })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("clean upload: stored privately, owner preview only, nothing public", async () => {
    const d = deps();
    const creator = await viewer(s.creatorIds.isadora);
    const r = await uploadMedia(creator, "post", "image/png", png(), d);
    expect(r.status).toBe("clean");
    expect(await previewUrl(creator, r.id, d)).toMatch(/^mock:\/\/u\/.+\?ttl=300$/);
    await expect(previewUrl(await viewer(s.memberId), r.id, d)).rejects.toMatchObject({ code: "not_found" });
    expect(await asViewer({ id: s.memberId, aal: 1 }, (q) => q.query(`select * from app.media_uploads`))).toHaveLength(0);
    expect(await asViewer({ id: creator.id, aal: 1 }, (q) => q.query(`select * from app.media_uploads`))).toHaveLength(1);
    expect(await rlsError(creator.id, `update app.media_uploads set status = 'clean'`, [], 1)).toBe("42501");
    expect(await rlsError(creator.id, `insert into app.media_uploads (owner_id, purpose, declared_mime) values ($1, 'post', 'image/png')`, [creator.id], 1)).toBe("42501");
  });

  it("scanner match → quarantined (kept as evidence, never served); scanner error → retry state", async () => {
    const d = deps();
    const creator = await viewer(s.creatorIds.isadora);
    const bad = await uploadMedia(creator, "post", "image/png", png(MOCK_MATCH_MARKER), d);
    expect(bad.status).toBe("quarantined");
    await expect(previewUrl(creator, bad.id, d)).rejects.toMatchObject({ code: "not_found" });
    const audit = await system((q) => q.query(`select 1 from app.audit_log where action = 'media.quarantined'`));
    expect(audit).toHaveLength(1);
    const flaky = await uploadMedia(creator, "post", "image/png", png(), { ...d, scanner: new MockScanner(true) });
    expect(flaky.status).toBe("uploaded");
  });

  it("authorization: members can't upload post media; spoofed files refused; abandoned uploads cleaned up", async () => {
    const d = deps();
    await expect(uploadMedia(await viewer(s.memberId), "post", "image/png", png(), d)).rejects.toMatchObject({ code: "forbidden" });
    await expect(uploadMedia(await viewer(s.creatorIds.isadora), "post", "image/png", exe(), d)).rejects.toMatchObject({ code: "validation" });
    const r = await uploadMedia(await viewer(s.creatorIds.isadora), "post", "image/png", png(), { ...d, scanner: new MockScanner(true) });
    await system((q) => q.query(`update app.media_uploads set created_at = now() - interval '2 days' where id = $1`, [r.id]));
    expect(await cleanupAbandoned(d.storage)).toBe(1);
    const st = await system((q) => q.one<{ status: string }>(`select status from app.media_uploads where id = $1`, [r.id]));
    expect(st!.status).toBe("abandoned");
  });
});
