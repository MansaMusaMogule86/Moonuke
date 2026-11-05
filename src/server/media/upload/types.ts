/**
 * Provider-independent storage and content-safety interfaces. A real adapter
 * (object storage; CSAM/NCII hash-matching) is plugged in only after the
 * owner approves the providers. Until then only the test mocks exist, and
 * production refuses them.
 */
export interface StorageAdapter {
  readonly id: string;
  put(key: string, bytes: Uint8Array, mime: string): Promise<void>;
  /** Short-lived, private read URL. Never permanent, never public. */
  signedReadUrl(key: string, ttlSec: number): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export type ScanResult = { verdict: "clean" } | { verdict: "match"; list: string } | { verdict: "error"; detail: string };

export interface SafetyScanner {
  readonly id: string;
  /** Hash-match / classifier check. A "match" must never be published. */
  scan(bytes: Uint8Array, mime: string): Promise<ScanResult>;
}
