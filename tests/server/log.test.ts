import { describe, expect, it, vi } from "vitest";
import { log, redact } from "@/server/log";

describe("structured log redaction", () => {
  it("redacts secret-looking keys, emails and long tokens; caps size", () => {
    const out = redact({
      password: "hunter2",
      sessionToken: "abc",
      email: "a@b.co",
      note: "contact rhea@example.com about it",
      url: "/invite/Zk3m9QpR7sT2vW8xY1aB4cD6eF0gH5jK",
      nested: { totpCode: "123456", ok: 1 },
      long: "x".repeat(2000),
    }) as Record<string, unknown>;
    expect(out.password).toBe("[redacted]");
    expect(out.sessionToken).toBe("[redacted]");
    expect(out.email).toBe("[redacted]");
    expect(out.note).toBe("contact [email] about it");
    expect(out.url).toBe("/invite/[redacted]");
    expect(out.nested).toEqual({ totpCode: "[redacted]", ok: 1 });
    expect((out.long as string).length).toBeLessThanOrEqual(500);
  });

  it("writes one JSON line per event", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    log("error", "request.error", { digest: "123", message: "boom for a@b.co" });
    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line).toMatchObject({ level: "error", event: "request.error", digest: "123", message: "boom for [email]" });
    spy.mockRestore();
  });
});
