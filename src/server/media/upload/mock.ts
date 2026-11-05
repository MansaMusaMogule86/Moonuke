import type { SafetyScanner, ScanResult, StorageAdapter } from "./types";

/**
 * TEST-ONLY providers. They refuse to construct in production, and env.ts
 * refuses STORAGE_PROVIDER=mock / SCAN_PROVIDER=mock in production.
 */
function assertNotProduction() {
  if (process.env.NODE_ENV === "production") throw new Error("Mock media providers are not allowed in production.");
}

export class MemoryStorage implements StorageAdapter {
  readonly id = "mock-memory";
  readonly objects = new Map<string, { bytes: Uint8Array; mime: string }>();
  constructor() {
    assertNotProduction();
  }
  async put(key: string, bytes: Uint8Array, mime: string) {
    this.objects.set(key, { bytes, mime });
  }
  async signedReadUrl(key: string, ttlSec: number) {
    if (!this.objects.has(key)) throw new Error("missing object");
    return `mock://${key}?ttl=${Math.min(ttlSec, 300)}`;
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
  async exists(key: string) {
    return this.objects.has(key);
  }
}

/** Flags any file containing the marker below, so tests can exercise quarantine. */
export const MOCK_MATCH_MARKER = "MOONUKE-TEST-HASH-MATCH";
export class MockScanner implements SafetyScanner {
  readonly id = "mock-scanner";
  constructor(private readonly failNext = false) {
    assertNotProduction();
  }
  async scan(bytes: Uint8Array): Promise<ScanResult> {
    if (this.failNext) return { verdict: "error", detail: "scanner unavailable" };
    return Buffer.from(bytes).includes(MOCK_MATCH_MARKER) ? { verdict: "match", list: "mock-list" } : { verdict: "clean" };
  }
}
