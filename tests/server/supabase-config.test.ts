import { afterEach, describe, expect, it } from "vitest";
import { _resetEnvCache, env } from "@/server/env";
import { supabaseServer } from "@/server/supabase/server";

const KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] as const;
const set = (url?: string, key?: string) => {
  if (url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  if (key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = key;
  _resetEnvCache();
};
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  _resetEnvCache();
});

describe("Supabase project settings (prepared, not active)", () => {
  it("accepts a project URL and a publishable key, and is optional", () => {
    set("https://gzskbodptvtrkevbibcb.supabase.co", "sb_publishable_dl9DYaVBwyyqZMASCNQZMg_HzvxqdbD");
    expect(env().NEXT_PUBLIC_SUPABASE_URL).toBe("https://gzskbodptvtrkevbibcb.supabase.co");
    set(undefined, undefined);
    expect(env().NEXT_PUBLIC_SUPABASE_URL).toBeUndefined();
  });

  it("refuses a secret or service-role key in the public variable, and non-Supabase URLs", () => {
    set("https://gzskbodptvtrkevbibcb.supabase.co", "sb_secret_abcdefghijklmnopqrstuvwxyz");
    expect(() => env()).toThrow(/publishable key/);
    set("https://gzskbodptvtrkevbibcb.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.service_role");
    expect(() => env()).toThrow(/publishable key/);
    set("http://gzskbodptvtrkevbibcb.supabase.co", undefined);
    expect(() => env()).toThrow(/supabase\.co/);
    set("https://evil.example.com", undefined);
    expect(() => env()).toThrow(/supabase\.co/);
  });

  it("the server client refuses to run while AUTH_PROVIDER=own", async () => {
    set("https://gzskbodptvtrkevbibcb.supabase.co", "sb_publishable_dl9DYaVBwyyqZMASCNQZMg_HzvxqdbD");
    expect(env().AUTH_PROVIDER).toBe("own");
    await expect(supabaseServer()).rejects.toThrow(/isn't active/);
  });
});
